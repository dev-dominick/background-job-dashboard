import { getDb, type TxSql } from "@/lib/db";
import type { Job, JobStats, JobType } from "./types";
import { nextRunAt } from "./retry";

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown> = {},
  opts: {
    priority?: number;
    maxAttempts?: number;
    scheduledAt?: Date;
    source?: string | null;
  } = {},
): Promise<string> {
  const sql = getDb();
  const { priority = 0, maxAttempts = 3, scheduledAt = new Date(), source = null } = opts;

  const [job] = await sql`
    INSERT INTO jobs (type, payload, priority, max_attempts, scheduled_at, source)
    VALUES (${type}, ${sql.json(payload as Parameters<typeof sql.json>[0])}, ${priority}, ${maxAttempts}, ${scheduledAt}, ${source})
    RETURNING id
  `;
  if (!job) throw new Error("INSERT failed to return job id");
  return job.id as string;
}

/**
 * Atomically dequeue the next eligible job using SELECT FOR UPDATE SKIP LOCKED.
 * Safe to call concurrently — two workers will never pick the same job.
 */
export async function dequeueNext(): Promise<Job | null> {
  const sql = getDb();

  const result = await sql.begin(async (tx: TxSql) => {
    const [job] = await tx`
      SELECT *
      FROM jobs
      WHERE status IN ('pending', 'failed')
        AND scheduled_at <= NOW()
      ORDER BY priority DESC, scheduled_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (!job) return null;

    await tx`
      UPDATE jobs
      SET status = 'running', started_at = NOW(), attempts = attempts + 1
      WHERE id = ${job.id}
    `;

    return job as Job;
  });

  return result ?? null;
}

export async function completeJob(id: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE jobs
    SET status = 'completed', completed_at = NOW()
    WHERE id = ${id}
  `;
}

/**
 * Mark a job as failed. Schedules a retry if attempts < max_attempts, otherwise marks dead.
 * Returns true if the job will be retried.
 */
export async function failJob(id: string, error: string): Promise<boolean> {
  const sql = getDb();
  const [job] = await sql`SELECT attempts, max_attempts FROM jobs WHERE id = ${id}`;
  if (!job) return false;

  const willRetry = (job.attempts as number) < (job.max_attempts as number);
  if (willRetry) {
    const retryAt = nextRunAt(job.attempts as number);
    await sql`
      UPDATE jobs
      SET status = 'failed', error = ${error}, scheduled_at = ${retryAt}
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE jobs
      SET status = 'dead', error = ${error}, completed_at = NOW()
      WHERE id = ${id}
    `;
  }
  return willRetry;
}

export async function getStats(): Promise<JobStats> {
  const sql = getDb();
  const rows = await sql`
    SELECT status, COUNT(*)::int AS count
    FROM jobs
    WHERE source IS DISTINCT FROM 'e2e'
    GROUP BY status
  `;
  const stats: JobStats = { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 };
  for (const row of rows) {
    const s = row.status as keyof JobStats;
    if (s in stats) stats[s] = row.count as number;
  }
  return stats;
}

export async function listJobs(limit = 50): Promise<Job[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT *
    FROM jobs
    WHERE source IS DISTINCT FROM 'e2e'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as Job[];
}

export async function retryJob(id: string): Promise<"ok" | "not_found" | "invalid_state"> {
  const sql = getDb();
  const [existing] = await sql`SELECT id, status FROM jobs WHERE id = ${id}`;

  if (!existing) {
    return "not_found";
  }

  if (!(["failed", "dead"] as const).includes(existing.status as "failed" | "dead")) {
    return "invalid_state";
  }

  await sql`
    UPDATE jobs
    SET status = 'pending',
        attempts = 0,
        scheduled_at = NOW(),
        started_at = NULL,
        completed_at = NULL,
        error = NULL
    WHERE id = ${id}
  `;

  return "ok";
}

export async function recoverStaleRunningJobs(maxAgeMs = 60_000): Promise<number> {
  const sql = getDb();
  const [updated] = await sql<{ count: number }[]>`
    WITH recovered AS (
      UPDATE jobs
      SET status = 'failed',
          error = COALESCE(error, 'Recovered stale processing lease'),
          started_at = NULL,
          scheduled_at = NOW()
      WHERE status = 'running'
        AND started_at IS NOT NULL
        AND started_at < NOW() - (${maxAgeMs} * INTERVAL '1 millisecond')
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM recovered
  `;

  return updated?.count ?? 0;
}
