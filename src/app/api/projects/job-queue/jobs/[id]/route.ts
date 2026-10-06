import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  isMissingJobsTableError,
  createJobQueueSchemaNotReadyResponse,
} from "@/features/job-queue/server";
import { createApiErrorBody } from "@/lib/http/api-error";
import { formatError, logError } from "@/lib/log";
import { UUID_RE } from "@/lib/utils/helpers";
import { authorizePrivilegedRequest } from "@/lib/security/privileged-request-auth";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const { id } = await params;

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

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      createApiErrorBody({ code: "INVALID_ID", message: "Invalid job ID", requestId }),
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  try {
    const sql = getDb();
    const [deleted] = await sql<{ id: string }[]>`
      DELETE FROM jobs
      WHERE id = ${id}
      RETURNING id
    `;

    if (!deleted) {
      return NextResponse.json(
        createApiErrorBody({ code: "NOT_FOUND", message: "Job not found", requestId }),
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }

    return NextResponse.json(
      { success: true, id: deleted.id },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (err) {
    if (isMissingJobsTableError(err)) {
      return createJobQueueSchemaNotReadyResponse(requestId);
    }

    logError("job_queue.delete_failed", { requestId, id, error: formatError(err) });
    return NextResponse.json(
      createApiErrorBody({ code: "INTERNAL_ERROR", message: "Internal server error", requestId }),
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
