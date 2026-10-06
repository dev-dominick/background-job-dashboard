import { NextResponse } from "next/server";
import {
  retryJob,
  isMissingJobsTableError,
  createJobQueueSchemaNotReadyResponse,
} from "@/features/job-queue/server";
import { createApiErrorBody } from "@/lib/http/api-error";
import { formatError, logError } from "@/lib/log";
import { UUID_RE } from "@/lib/utils/helpers";
import { authorizePrivilegedRequest } from "@/lib/security/privileged-request-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const result = await retryJob(id);

    if (result === "not_found") {
      return NextResponse.json(
        createApiErrorBody({ code: "NOT_FOUND", message: "Job not found", requestId }),
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }

    if (result === "invalid_state") {
      return NextResponse.json(
        createApiErrorBody({
          code: "INVALID_STATE",
          message: "Only failed or dead jobs can be retried",
          requestId,
        }),
        { status: 409, headers: { "x-request-id": requestId } },
      );
    }

    return NextResponse.json(
      { success: true, id },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (err) {
    if (isMissingJobsTableError(err)) {
      return createJobQueueSchemaNotReadyResponse(requestId);
    }

    logError("job_queue.retry_failed", { requestId, id, error: formatError(err) });
    return NextResponse.json(
      createApiErrorBody({ code: "INTERNAL_ERROR", message: "Internal server error", requestId }),
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
