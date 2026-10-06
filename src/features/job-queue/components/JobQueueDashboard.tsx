"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Select } from "@/components/ui";
import type { Job, JobStats, JobType } from "@/features/job-queue";

type ApiError = { error?: { code?: string; message?: string } };

type ApiFailure = {
  code?: string;
  message: string;
  status: number;
};

const POLL_BASE_DELAY_MS = 2_000;
const POLL_MAX_DELAY_MS = 30_000;
const WORKER_DEFAULT_INTERVAL_MS = 2_000;
const WORKER_MIN_INTERVAL_MS = 1_000;
const WORKER_MAX_INTERVAL_MS = 10_000;
const WORKER_LOG_LIMIT = 12;

type WorkerEventType = "info" | "success" | "warning" | "error";

type WorkerEvent = {
  id: string;
  timestamp: number;
  type: WorkerEventType;
  message: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "text-(--warning) bg-(--warning-muted) border-(--warning)/30",
  running: "text-(--tone-blue) bg-(--tone-blue)/15 border-(--tone-blue)/25",
  completed: "text-(--accent) bg-(--accent-muted) border-(--accent)/20",
  failed: "text-(--error) bg-(--error-muted) border-(--error)/25",
  dead: "text-(--text-muted) bg-(--surface-overlay) border-(--border-subtle)",
};

const JOB_TYPES: { value: JobType; label: string; desc: string }[] = [
  {
    value: "simulate_work",
    label: "simulate_work",
    desc: "Sleep N ms, optionally fail (chaos mode)",
  },
  {
    value: "cleanup_expired_polls",
    label: "cleanup_expired_polls",
    desc: "DELETE expired polls from DB",
  },
  { value: "send_email_mock", label: "send_email_mock", desc: "Log a mock email send" },
];

function normalizeJob(job: Job): Job {
  return {
    ...job,
    scheduled_at: new Date(job.scheduled_at),
    started_at: job.started_at ? new Date(job.started_at) : null,
    completed_at: job.completed_at ? new Date(job.completed_at) : null,
    created_at: new Date(job.created_at),
  };
}

function isSchemaNotReadyError(failure: ApiFailure): boolean {
  return failure.status === 503 && failure.code === "SCHEMA_NOT_READY";
}

async function parseError(response: Response): Promise<ApiFailure> {
  const data = (await response.json().catch(() => ({}))) as ApiError;
  return {
    code: data.error?.code,
    message: data.error?.message || "Request failed",
    status: response.status,
  };
}

export function JobQueueDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<JobStats>({
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    dead: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemaUnavailable, setSchemaUnavailable] = useState(false);
  const [pollDelayMs, setPollDelayMs] = useState(POLL_BASE_DELAY_MS);

  const [jobType, setJobType] = useState<JobType>("simulate_work");
  const [duration, setDuration] = useState(1200);
  const [chaos, setChaos] = useState(false);
  const [priority, setPriority] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingResult, setProcessingResult] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [archiving, setArchiving] = useState<Record<string, boolean>>({});
  const [workerRunning, setWorkerRunning] = useState(false);
  const [workerIntervalMs, setWorkerIntervalMs] = useState(WORKER_DEFAULT_INTERVAL_MS);
  const [workerLastRunAt, setWorkerLastRunAt] = useState<number | null>(null);
  const [workerLastJobId, setWorkerLastJobId] = useState<string | null>(null);
  const [workerLastResult, setWorkerLastResult] = useState<string>("No runs yet");
  const [workerEvents, setWorkerEvents] = useState<WorkerEvent[]>([]);

  const inFlightRef = useRef(false);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(POLL_BASE_DELAY_MS);
  const workerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workerInFlightRef = useRef(false);

  const setNextPollDelay = useCallback((nextDelayMs: number) => {
    delayRef.current = nextDelayMs;
    setPollDelayMs(nextDelayMs);
  }, []);

  const clearPollTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // This polling callback intentionally uses manual memoization around refs/timers.
  // React Compiler cannot currently preserve that memoization automatically.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const load = useCallback(async () => {
    if (stoppedRef.current || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    clearPollTimer();

    try {
      const res = await fetch("/api/projects/job-queue/jobs", { cache: "no-store" });
      if (!res.ok) {
        const failure = await parseError(res);
        setError(failure.message);
        if (isSchemaNotReadyError(failure)) {
          setSchemaUnavailable(true);
          setNextPollDelay(Math.min(delayRef.current * 2, POLL_MAX_DELAY_MS));
        }
        return;
      }

      const data = (await res.json()) as { jobs: Job[]; stats: JobStats };
      setJobs(data.jobs.map(normalizeJob));
      setStats(data.stats);
      setSchemaUnavailable(false);
      setError(null);
      setNextPollDelay(POLL_BASE_DELAY_MS);
    } catch {
      setError("Unable to load queue state.");
      setNextPollDelay(Math.min(delayRef.current * 2, POLL_MAX_DELAY_MS));
    } finally {
      inFlightRef.current = false;
      setLoading(false);

      if (!stoppedRef.current) {
        timerRef.current = setTimeout(() => {
          void load();
        }, delayRef.current);
      }
    }
  }, [clearPollTimer, setNextPollDelay]);

  useEffect(() => {
    stoppedRef.current = false;
    void load();

    return () => {
      stoppedRef.current = true;
      clearPollTimer();
    };
  }, [clearPollTimer, load]);

  const retryPolling = useCallback(() => {
    setError(null);
    setSchemaUnavailable(false);
    setNextPollDelay(POLL_BASE_DELAY_MS);
    void load();
  }, [load, setNextPollDelay]);

  const appendWorkerEvent = useCallback((type: WorkerEventType, message: string) => {
    setWorkerEvents((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          type,
          message,
        },
        ...prev,
      ].slice(0, WORKER_LOG_LIMIT),
    );
  }, []);

  const executeProcess = useCallback(
    async (source: "manual" | "worker") => {
      const res = await fetch("/api/projects/job-queue/process", { method: "POST" });
      if (!res.ok) {
        const failure = await parseError(res);
        setError(failure.message);
        if (isSchemaNotReadyError(failure)) {
          setSchemaUnavailable(true);
        }

        if (source === "worker") {
          setWorkerLastRunAt(Date.now());
          setWorkerLastResult(`Error: ${failure.message}`);
          appendWorkerEvent("error", `Worker error: ${failure.message}`);
        }

        return;
      }

      const data = (await res.json()) as {
        processed: boolean;
        jobId?: string;
        success?: boolean;
        willRetry?: boolean;
      };

      if (!data.processed) {
        const message = "No eligible jobs to process.";
        setProcessingResult(message);
        if (source === "worker") {
          setWorkerLastRunAt(Date.now());
          setWorkerLastResult(message);
          appendWorkerEvent("info", "Worker ran: no pending or eligible job found.");
        }
      } else if (data.success) {
        const message = `Processed job ${data.jobId?.slice(0, 8)} successfully.`;
        setProcessingResult(message);
        if (source === "worker") {
          setWorkerLastRunAt(Date.now());
          setWorkerLastJobId(data.jobId ?? null);
          setWorkerLastResult("pending -> running -> completed");
          appendWorkerEvent("success", message);
        }
      } else if (data.willRetry) {
        const message = `Job ${data.jobId?.slice(0, 8)} failed and was scheduled for retry.`;
        setProcessingResult(message);
        if (source === "worker") {
          setWorkerLastRunAt(Date.now());
          setWorkerLastJobId(data.jobId ?? null);
          setWorkerLastResult("pending -> running -> failed -> retry scheduled");
          appendWorkerEvent("warning", message);
        }
      } else {
        const message = `Job ${data.jobId?.slice(0, 8)} failed and moved to dead-letter.`;
        setProcessingResult(message);
        if (source === "worker") {
          setWorkerLastRunAt(Date.now());
          setWorkerLastJobId(data.jobId ?? null);
          setWorkerLastResult("pending -> running -> dead");
          appendWorkerEvent("warning", message);
        }
      }

      setSchemaUnavailable(false);
      await load();
    },
    [appendWorkerEvent, load],
  );

  const clearWorkerInterval = useCallback(() => {
    if (workerIntervalRef.current) {
      clearInterval(workerIntervalRef.current);
      workerIntervalRef.current = null;
    }
    workerInFlightRef.current = false;
  }, []);

  const runWorkerTick = useCallback(async () => {
    if (workerInFlightRef.current) {
      return;
    }

    workerInFlightRef.current = true;
    try {
      await executeProcess("worker");
    } finally {
      workerInFlightRef.current = false;
    }
  }, [executeProcess]);

  const startWorker = useCallback(() => {
    if (workerRunning || schemaUnavailable) {
      return;
    }

    clearWorkerInterval();
    setWorkerRunning(true);
    appendWorkerEvent("info", `Worker started. Processing every ${workerIntervalMs}ms.`);
    void runWorkerTick();

    workerIntervalRef.current = setInterval(() => {
      void runWorkerTick();
    }, workerIntervalMs);
  }, [
    appendWorkerEvent,
    clearWorkerInterval,
    runWorkerTick,
    schemaUnavailable,
    workerIntervalMs,
    workerRunning,
  ]);

  const stopWorker = useCallback(() => {
    if (!workerRunning) {
      return;
    }
    clearWorkerInterval();
    setWorkerRunning(false);
    appendWorkerEvent("info", "Worker stopped.");
  }, [appendWorkerEvent, clearWorkerInterval, workerRunning]);

  useEffect(() => {
    if (!workerRunning) {
      return;
    }

    clearWorkerInterval();
    workerIntervalRef.current = setInterval(() => {
      void runWorkerTick();
    }, workerIntervalMs);

    return () => {
      clearWorkerInterval();
    };
  }, [clearWorkerInterval, runWorkerTick, workerIntervalMs, workerRunning]);

  useEffect(
    () => () => {
      clearWorkerInterval();
    },
    [clearWorkerInterval],
  );

  const canRetry = useMemo(() => new Set(["failed", "dead"]), []);

  async function enqueueJob(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setProcessingResult(null);

    try {
      const payload: Record<string, unknown> = {};
      if (jobType === "simulate_work") {
        payload.duration = duration;
        if (chaos) payload.chaos = true;
      }
      if (jobType === "send_email_mock") {
        payload.to = "demo@example.com";
        payload.subject = "Demo email from Background Job Processing Dashboard";
      }

      const res = await fetch("/api/projects/job-queue/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: jobType, payload, priority, maxAttempts: 3 }),
      });

      if (!res.ok) {
        const failure = await parseError(res);
        setError(failure.message);
        if (isSchemaNotReadyError(failure)) {
          setSchemaUnavailable(true);
        }
        return;
      }

      setSchemaUnavailable(false);
      await load();
    } catch {
      setError("Failed to enqueue job.");
    } finally {
      setSubmitting(false);
    }
  }

  async function processNext() {
    setProcessing(true);
    setProcessingResult(null);

    try {
      await executeProcess("manual");
    } catch {
      setError("Failed to process job.");
    } finally {
      setProcessing(false);
    }
  }

  async function retryJob(id: string) {
    setRetrying((prev) => ({ ...prev, [id]: true }));
    setProcessingResult(null);

    try {
      const res = await fetch(`/api/projects/job-queue/jobs/${id}/retry`, { method: "POST" });
      if (!res.ok) {
        const failure = await parseError(res);
        setError(failure.message);
        if (isSchemaNotReadyError(failure)) {
          setSchemaUnavailable(true);
        }
        return;
      }

      setSchemaUnavailable(false);
      setProcessingResult(`Retried job ${id.slice(0, 8)}.`);
      await load();
    } catch {
      setError("Failed to retry job.");
    } finally {
      setRetrying((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function archiveJob(id: string) {
    setArchiving((prev) => ({ ...prev, [id]: true }));
    setProcessingResult(null);

    try {
      const res = await fetch(`/api/projects/job-queue/jobs/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const failure = await parseError(res);
        setError(failure.message);
        if (isSchemaNotReadyError(failure)) {
          setSchemaUnavailable(true);
        }
        return;
      }

      setSchemaUnavailable(false);
      setProcessingResult(`Archived job ${id.slice(0, 8)}.`);
      await load();
    } catch {
      setError("Failed to archive job.");
    } finally {
      setArchiving((prev) => ({ ...prev, [id]: false }));
    }
  }

  const statCards = [
    { label: "Pending", key: "pending" as const, color: "text-(--warning)" },
    { label: "Running", key: "running" as const, color: "text-(--tone-blue)" },
    { label: "Completed", key: "completed" as const, color: "text-(--accent)" },
    { label: "Failed", key: "failed" as const, color: "text-(--error)" },
    { label: "Dead", key: "dead" as const, color: "text-(--text-muted)" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary) sm:text-3xl">
          Background Job Processing Dashboard
        </h1>
        <p className="mt-2 text-sm text-(--text-secondary)">
          Queue lifecycle controls with persisted retries, claims, and dead-letter state.
        </p>
      </div>

      {schemaUnavailable && (
        <div className="rounded border border-(--warning)/40 bg-(--warning-muted) px-3 py-2 text-sm text-(--warning)">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Queue schema is unavailable. Auto-retry is backing off to{" "}
              {Math.ceil(pollDelayMs / 1000)}s.
            </span>
            <Button
              type="button"
              onClick={() => retryPolling()}
              size="sm"
              variant="outline"
              className="h-7 px-2 py-0.5 text-xs"
            >
              Retry now
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-(--error)/40 bg-(--error-muted) px-3 py-2 text-sm text-(--error)">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {statCards.map((s) => (
          <div
            key={s.key}
            className="rounded border border-(--border-subtle) bg-(--surface-raised) p-3 text-center"
          >
            <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{stats[s.key]}</div>
            <div className="mt-1 text-[11px] text-(--text-muted)">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Submit form */}
      <section className="rounded border border-(--border-subtle) bg-(--surface-raised) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--text-primary)">Enqueue a job</h2>
        <form onSubmit={enqueueJob} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="job-type-select"
                className="mb-1.5 block text-[11px] font-medium text-(--text-muted) uppercase tracking-[0.16em]"
              >
                Job type
              </label>
              <Select
                id="job-type-select"
                value={jobType}
                onChange={(e) => setJobType(e.target.value as JobType)}
              >
                {JOB_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-[11px] text-(--text-muted)">
                {JOB_TYPES.find((t) => t.value === jobType)?.desc}
              </p>
            </div>

            <div>
              <label
                htmlFor="priority-select"
                className="mb-1.5 block text-[11px] font-medium text-(--text-muted) uppercase tracking-[0.16em]"
              >
                Priority
              </label>
              <Select
                id="priority-select"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              >
                <option value={0}>Normal (0)</option>
                <option value={5}>High (5)</option>
                <option value={10}>Critical (10)</option>
              </Select>
            </div>
          </div>

          {jobType === "simulate_work" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="duration-range"
                  className="mb-1.5 block text-[11px] font-medium text-(--text-muted) uppercase tracking-[0.16em]"
                >
                  Duration — {duration}ms
                </label>
                <input
                  id="duration-range"
                  type="range"
                  min={100}
                  max={5000}
                  step={100}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full accent-(--accent)"
                  aria-label="Job duration in milliseconds"
                />
              </div>

              <div className="flex flex-col gap-3 pt-5">
                <label
                  htmlFor="chaos-switch"
                  className="text-[11px] font-medium text-(--text-muted) uppercase tracking-[0.16em]"
                >
                  Chaos mode
                </label>
                <button
                  id="chaos-switch"
                  type="button"
                  role="switch"
                  aria-checked={chaos}
                  aria-label="Toggle chaos mode - makes jobs randomly fail"
                  onClick={() => setChaos((c) => !c)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    chaos ? "bg-(--error)" : "bg-(--border-default)"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      chaos ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <div>
                  <p className="text-sm text-(--text-primary)">Chaos mode</p>
                  <p className="text-[11px] text-(--text-muted)">
                    Inject failures to verify retries
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button type="submit" disabled={submitting || schemaUnavailable} variant="secondary">
            {submitting ? "Enqueueing…" : "Enqueue job →"}
          </Button>
        </form>
      </section>

      <section className="rounded border border-(--border-subtle) bg-(--surface-raised) p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-(--text-primary)">Queue controls</h2>
          <Button
            type="button"
            onClick={() => void processNext()}
            disabled={processing || schemaUnavailable}
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs"
          >
            {processing ? "Processing…" : "Process next eligible"}
          </Button>
          <Button
            type="button"
            onClick={() => retryPolling()}
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs"
          >
            {schemaUnavailable ? "Retry now" : "Refresh"}
          </Button>
          {processingResult && (
            <span className="text-xs text-(--text-muted)">{processingResult}</span>
          )}
        </div>
      </section>

      <section className="rounded border border-(--border-subtle) bg-(--surface-raised) p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-(--text-primary)">Worker simulator</h2>
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              workerRunning
                ? "border-(--accent)/35 bg-(--accent)/10 text-(--accent)"
                : "border-(--border-subtle) bg-(--surface-base) text-(--text-muted)"
            }`}
          >
            {workerRunning ? "running" : "stopped"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-(--text-muted)">Status</p>
            <p className="mt-1 text-sm text-(--text-primary)">
              Worker: {workerRunning ? "running" : "stopped"}
            </p>
          </div>
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-(--text-muted)">Interval</p>
            <p className="mt-1 text-sm text-(--text-primary)">Every {workerIntervalMs}ms</p>
          </div>
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-(--text-muted)">Last run</p>
            <p className="mt-1 text-sm text-(--text-primary)">
              {workerLastRunAt ? new Date(workerLastRunAt).toLocaleTimeString() : "Not run yet"}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-(--text-muted)">
              Last claimed job
            </p>
            <p className="mt-1 text-sm font-mono text-(--text-primary)">
              {workerLastJobId ? workerLastJobId.slice(0, 8) : "None"}
            </p>
          </div>
          <div className="rounded border border-(--border-subtle) bg-(--surface-base) px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-(--text-muted)">
              Last result
            </p>
            <p className="mt-1 text-sm text-(--text-primary)">{workerLastResult}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label
              htmlFor="worker-interval-select"
              className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-(--text-muted)"
            >
              Process interval
            </label>
            <Select
              id="worker-interval-select"
              value={workerIntervalMs}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                const nextInterval = Math.min(
                  Math.max(parsed, WORKER_MIN_INTERVAL_MS),
                  WORKER_MAX_INTERVAL_MS,
                );
                setWorkerIntervalMs(nextInterval);
                appendWorkerEvent("info", `Worker interval set to ${nextInterval}ms.`);
              }}
              disabled={workerRunning}
            >
              <option value={1000}>1000ms</option>
              <option value={2000}>2000ms</option>
              <option value={3000}>3000ms</option>
              <option value={5000}>5000ms</option>
            </Select>
          </div>

          <Button
            type="button"
            onClick={() => void startWorker()}
            disabled={workerRunning || schemaUnavailable}
            size="sm"
            variant="secondary"
            className="h-8 px-3 text-xs"
          >
            Start worker
          </Button>
          <Button
            type="button"
            onClick={() => void stopWorker()}
            disabled={!workerRunning}
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs"
          >
            Stop worker
          </Button>
        </div>

        <div className="mt-4 rounded border border-(--border-subtle) bg-(--surface-base) p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-(--text-muted)">
              Recent worker events
            </p>
            <span className="text-[10px] text-(--text-muted)">Newest first</span>
          </div>
          {workerEvents.length === 0 ? (
            <p className="text-xs text-(--text-muted)">No worker events yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {workerEvents.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-(--text-muted)">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      event.type === "success"
                        ? "bg-(--accent-muted) text-(--accent)"
                        : event.type === "warning"
                          ? "bg-(--warning-muted) text-(--warning)"
                          : event.type === "error"
                            ? "bg-(--error-muted) text-(--error)"
                            : "bg-(--surface-overlay) text-(--text-muted)"
                    }`}
                  >
                    {event.type}
                  </span>
                  <span className="text-(--text-secondary)">{event.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Live job list */}
      <section className="rounded border border-(--border-subtle) bg-(--surface-raised) p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-(--text-primary)">Persisted jobs</h2>
          <span className="text-[11px] text-(--text-muted)">
            {loading ? "Loading…" : jobs.length > 0 ? `${jobs.length} jobs` : "No jobs yet"}
          </span>
        </div>

        {!loading && jobs.length === 0 ? (
          <p className="text-sm text-(--text-muted)">No jobs. Enqueue one above.</p>
        ) : (
          <div className="space-y-1.5">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center gap-2.5 rounded border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm"
              >
                <code className="font-mono text-[11px] text-(--text-muted)">
                  {job.id.slice(0, 8)}
                </code>
                <span className="text-(--text-secondary)">{job.type}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[job.status] ?? ""}`}
                >
                  {job.status === "running" ? "processing" : job.status}
                </span>
                <span className="text-[11px] text-(--text-muted)">
                  attempts {job.attempts}/{job.max_attempts}
                </span>
                {job.error && (
                  <span className="max-w-xs truncate text-[11px] text-(--error)" title={job.error}>
                    {job.error}
                  </span>
                )}
                {canRetry.has(job.status) && (
                  <Button
                    type="button"
                    onClick={() => void retryJob(job.id)}
                    disabled={retrying[job.id] || schemaUnavailable}
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 py-0 text-[11px]"
                  >
                    {retrying[job.id] ? "Retrying…" : "Retry"}
                  </Button>
                )}
                {(job.status === "completed" ||
                  job.status === "failed" ||
                  job.status === "dead") && (
                  <Button
                    type="button"
                    onClick={() => void archiveJob(job.id)}
                    disabled={archiving[job.id] || schemaUnavailable}
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 py-0 text-[11px]"
                  >
                    {archiving[job.id] ? "Archiving…" : "Archive"}
                  </Button>
                )}
                <span className="ml-auto font-mono text-[11px] text-(--text-muted)">
                  {new Date(job.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
