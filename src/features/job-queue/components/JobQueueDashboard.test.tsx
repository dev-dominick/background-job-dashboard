// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobQueueDashboard } from "./JobQueueDashboard";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

type MockResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

function createJobsResponse() {
  return {
    ok: true,
    json: async () => ({
      jobs: [],
      stats: { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 },
    }),
  } satisfies MockResponse;
}

function createProcessResponse(payload: {
  processed: boolean;
  jobId?: string;
  success?: boolean;
  willRetry?: boolean;
}) {
  return {
    ok: true,
    json: async () => payload,
  } satisfies MockResponse;
}

function createErrorResponse(message: string, status = 500) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  } satisfies MockResponse;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/projects/job-queue/process")) {
      return createProcessResponse({
        processed: true,
        jobId: "job-success-1234",
        success: true,
      }) as Response;
    }
    return createJobsResponse() as Response;
  });
});

afterEach(() => {
  cleanup();
});

describe("JobQueueDashboard", () => {
  it("renders queue heading and persisted empty-state notice", async () => {
    render(<JobQueueDashboard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      screen.getByRole("heading", { name: "Background Job Processing Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No jobs. Enqueue one above.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Worker simulator" })).toBeInTheDocument();
    expect(screen.getByText("Worker: stopped")).toBeInTheDocument();
    expect(screen.getByText("No worker events yet.")).toBeInTheDocument();
  });

  it("starts worker interval processing and logs successful runs", async () => {
    let processCalls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/projects/job-queue/process")) {
        processCalls += 1;
        return createProcessResponse({
          processed: true,
          jobId: "job-success-1234",
          success: true,
        }) as Response;
      }
      return createJobsResponse() as Response;
    });

    render(<JobQueueDashboard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Start worker" }));
    await waitFor(() => expect(processCalls).toBeGreaterThanOrEqual(1));
    const workerPanel = screen
      .getByRole("heading", { name: "Worker simulator" })
      .closest("section");
    expect(workerPanel).not.toBeNull();
    expect(
      within(workerPanel as HTMLElement).getByText(/Processed job job-succ successfully\./),
    ).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 2_100));
    await waitFor(() => expect(processCalls).toBeGreaterThanOrEqual(2));

    expect(screen.getByText("pending -> running -> completed")).toBeInTheDocument();
    expect(screen.getByText(/Every 2000ms/)).toBeInTheDocument();
  });

  it("stops worker and halts further process calls", async () => {
    let processCalls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/projects/job-queue/process")) {
        processCalls += 1;
        return createProcessResponse({
          processed: true,
          jobId: "job-stop-1234",
          success: true,
        }) as Response;
      }
      return createJobsResponse() as Response;
    });

    render(<JobQueueDashboard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Start worker" }));
    await waitFor(() => expect(processCalls).toBeGreaterThanOrEqual(1));

    fireEvent.click(screen.getByRole("button", { name: "Stop worker" }));
    const baseline = processCalls;

    await new Promise((resolve) => setTimeout(resolve, 4_500));

    expect(processCalls).toBe(baseline);
    expect(screen.getByText("Worker: stopped")).toBeInTheDocument();
    expect(screen.getByText("Worker stopped.")).toBeInTheDocument();
  });

  it("logs empty queue result clearly", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/projects/job-queue/process")) {
        return createProcessResponse({ processed: false }) as Response;
      }
      return createJobsResponse() as Response;
    });

    render(<JobQueueDashboard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Start worker" }));
    await waitFor(() => {
      expect(screen.getByText("Worker ran: no pending or eligible job found.")).toBeInTheDocument();
    });
    const workerPanel = screen
      .getByRole("heading", { name: "Worker simulator" })
      .closest("section");
    expect(workerPanel).not.toBeNull();
    expect(
      within(workerPanel as HTMLElement).getByText("No eligible jobs to process."),
    ).toBeInTheDocument();
  });

  it("logs API errors without crashing", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/projects/job-queue/process")) {
        return createErrorResponse("Worker endpoint failed", 500) as Response;
      }
      return createJobsResponse() as Response;
    });

    render(<JobQueueDashboard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Start worker" }));
    await waitFor(() => {
      expect(screen.getByText("Worker error: Worker endpoint failed")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Background Job Processing Dashboard" }),
    ).toBeInTheDocument();
  });
});
