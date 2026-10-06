import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  dequeueNext,
  completeJob,
  failJob,
  recoverStaleRunningJobs,
  isMissingJobsTableError,
  createJobQueueSchemaNotReadyResponse,
} from "@/features/job-queue/server";
import { createApiErrorBody } from "@/lib/http/api-error";
import { formatError, logError, logInfo } from "@/lib/log";
import type { Job } from "@/features/job-queue";
import { authorizePrivilegedRequest } from "@/lib/security/privileged-request-auth";

/**
 * Execute a single job inline.
 * Called for each job type after dequeue.
 */
async function executeJob(job: Job): Promise<void> {
  switch (job.type) {
    case "simulate_work": {
      const duration = Math.min(Number(job.payload.duration ?? 1000), 5000);
      const chaos = Boolean(job.payload.chaos);
      await new Promise((resolve) => setTimeout(resolve, duration));
      if (chaos && Math.random() < 0.5) {
        throw new Error("Chaos mode: random failure injected");
      }
      break;
    }

    case "cleanup_expired_polls": {
      const sql = getDb();
      const result = await sql`
        DELETE FROM polls
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
        RETURNING id
      `;
      logInfo("job.cleanup_expired_polls.done", { deleted: result.length });
      break;
    }

    case "send_email_mock": {
      const to = String(job.payload.to ?? "demo@example.com");
      const subject = String(job.payload.subject ?? "(no subject)");
      logInfo("job.send_email_mock.sent", { to, subject });
      // Simulate a short send delay
      await new Promise((resolve) => setTimeout(resolve, 200));
      break;
    }

    default: {
      // Exhaustive check — should never happen if enqueue validates type
      const exhaustive: never = job.type;
      throw new Error(`Unknown job type: ${String(exhaustive)}`);
    }
  }
}

/**
 * POST /api/projects/job-queue/process
 *
 * Dequeues one job using SELECT FOR UPDATE SKIP LOCKED and executes it.
 * Designed to be called repeatedly (e.g. every 2s) from the demo client.
 * Safe to call concurrently — two workers will never pick the same job.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

  const authz = await authorizePrivilegedRequest(request);
  if (!authz.ok) {
    return NextResponse.json(
      createApiErrorBody({
        code: "UNAUTHORIZED",
        message: "Authentication required",
        requestId,
      }),
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  try {
    await recoverStaleRunningJobs();
    const job = await dequeueNext();

    if (!job) {
      return NextResponse.json(
        { processed: false },
        { headers: { "cache-control": "no-store", "x-request-id": requestId } },
      );
    }

    try {
      await executeJob(job);
      await completeJob(job.id);
      return NextResponse.json(
        { processed: true, jobId: job.id, type: job.type, success: true },
        { headers: { "cache-control": "no-store", "x-request-id": requestId } },
      );
    } catch (jobErr) {
      const errorMsg = formatError(jobErr);
      const willRetry = await failJob(job.id, errorMsg);
      return NextResponse.json(
        { processed: true, jobId: job.id, type: job.type, success: false, willRetry },
        { headers: { "cache-control": "no-store", "x-request-id": requestId } },
      );
    }
  } catch (err) {
    if (isMissingJobsTableError(err)) {
      return createJobQueueSchemaNotReadyResponse(requestId);
    }
    logError("job_queue.process_failed", { requestId, error: formatError(err) });
    return NextResponse.json(
      createApiErrorBody({ code: "INTERNAL_ERROR", message: "Internal server error", requestId }),
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
