import { NextResponse } from "next/server";
import { createApiErrorBody } from "@/lib/http/api-error";

const PG_UNDEFINED_TABLE = "42P01";

type PgLikeError = {
  code?: string;
  message?: string;
};

/**
 * Detects missing `jobs` table errors from Postgres.
 */
export function isMissingJobsTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const pgError = error as PgLikeError;
  if (pgError.code !== PG_UNDEFINED_TABLE) {
    return false;
  }

  const message = String(pgError.message ?? "").toLowerCase();
  return message.includes('relation "jobs"') || message.includes("relation jobs");
}

export function createJobQueueSchemaNotReadyResponse(requestId: string) {
  return NextResponse.json(
    createApiErrorBody({
      code: "SCHEMA_NOT_READY",
      message:
        "Job queue schema is not ready. Apply database migrations, including db/migrations/011_job_queue.sql.",
      requestId,
      details: { component: "job_queue", migration: "db/migrations/011_job_queue.sql" },
    }),
    {
      status: 503,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    },
  );
}
