import { listJobs, getStats, isMissingJobsTableError } from "@/features/job-queue/server";
import { toPublicJob } from "@/features/job-queue/server/public-projection";
import { formatError, logError, logWarn } from "@/lib/log";

const MAX_STREAM_DURATION_MS = 50 * 1000;

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let interval: ReturnType<typeof setInterval> | null = null;

      async function sendUpdate() {
        if (closed) return;
        try {
          const [jobs, stats] = await Promise.all([listJobs(50), getStats()]);
          const payload = { jobs: jobs.map(toPublicJob), stats };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch (err) {
          if (isMissingJobsTableError(err)) {
            logWarn("job_queue.schema_not_ready", {
              requestId,
              migration: "db/migrations/001_job_queue.sql",
            });
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ jobs: [], stats: { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 } })}\n\n`,
              ),
            );
            closed = true;
            if (interval) clearInterval(interval);
            controller.close();
            return;
          }
          logError("job_queue.stream_query_failed", { error: formatError(err) });
        }
      }

      await sendUpdate();
      interval = setInterval(sendUpdate, 2000);

      const timeout = setTimeout(() => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }, MAX_STREAM_DURATION_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (interval) clearInterval(interval);
        clearTimeout(timeout);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "x-request-id": requestId,
    },
  });
}
