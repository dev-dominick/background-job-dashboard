import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enqueue,
  listJobs,
  getStats,
  isMissingJobsTableError,
  createJobQueueSchemaNotReadyResponse,
} from "@/features/job-queue/server";
import { toPublicJob } from "@/features/job-queue/server/public-projection";
import { createApiErrorBody } from "@/lib/http/api-error";
import { formatError, logError } from "@/lib/log";
import type { JobType } from "@/features/job-queue";
import { authorizePrivilegedRequest } from "@/lib/security/privileged-request-auth";

const MAX_JOB_ENQUEUE_BODY_BYTES = 16 * 1024;
const MAX_PAYLOAD_DEPTH = 4;
const MAX_PAYLOAD_KEYS_PER_OBJECT = 40;
const MAX_PAYLOAD_ARRAY_ITEMS = 50;
const MAX_PAYLOAD_STRING_LENGTH = 300;

const enqueueSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("simulate_work"),
      payload: z
        .object({
          duration: z.number().int().min(1).max(600).optional(),
          chaos: z.boolean().optional(),
        })
        .strict()
        .optional()
        .default({}),
      priority: z.number().int().min(0).max(5).optional().default(0),
      maxAttempts: z.number().int().min(1).max(5).optional().default(3),
    })
    .strict(),
  z
    .object({
      type: z.literal("send_email_mock"),
      payload: z
        .object({
          to: z.string().max(320).optional(),
          subject: z.string().max(300).optional(),
        })
        .strict()
        .optional()
        .default({}),
      priority: z.number().int().min(0).max(5).optional().default(0),
      maxAttempts: z.number().int().min(1).max(5).optional().default(3),
    })
    .strict(),
  z
    .object({
      type: z.literal("cleanup_expired_polls"),
      payload: z.object({}).strict().optional().default({}),
      priority: z.number().int().min(0).max(5).optional().default(0),
      maxAttempts: z.number().int().min(1).max(5).optional().default(3),
    })
    .strict(),
]);

function isValidPayloadShape(value: unknown, depth = 0): boolean {
  if (value === null) return true;

  if (typeof value === "string") {
    return value.length <= MAX_PAYLOAD_STRING_LENGTH;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return Number.isFinite(value as number) || typeof value === "boolean";
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_PAYLOAD_DEPTH || value.length > MAX_PAYLOAD_ARRAY_ITEMS) {
      return false;
    }

    return value.every((entry) => isValidPayloadShape(entry, depth + 1));
  }

  if (typeof value === "object") {
    if (depth >= MAX_PAYLOAD_DEPTH) {
      return false;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_PAYLOAD_KEYS_PER_OBJECT) {
      return false;
    }

    return entries.every(
      ([key, entry]) => key.length <= 80 && isValidPayloadShape(entry, depth + 1),
    );
  }

  return false;
}

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    const [jobs, stats] = await Promise.all([listJobs(50), getStats()]);
    return NextResponse.json(
      { jobs: jobs.map(toPublicJob), stats },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (err) {
    if (isMissingJobsTableError(err)) {
      return createJobQueueSchemaNotReadyResponse(requestId);
    }
    logError("job_queue.list_failed", { requestId, error: formatError(err) });
    return NextResponse.json(
      createApiErrorBody({ code: "INTERNAL_ERROR", message: "Internal server error", requestId }),
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const source = request.headers.get("x-portfolio-test-run") ? "e2e" : null;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        createApiErrorBody({
          code: "UNSUPPORTED_CONTENT_TYPE",
          message: "Unsupported content type",
          requestId,
        }),
        { status: 415, headers: { "x-request-id": requestId } },
      );
    }

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_JOB_ENQUEUE_BODY_BYTES) {
      return NextResponse.json(
        createApiErrorBody({
          code: "PAYLOAD_TOO_LARGE",
          message: "Job payload exceeds allowed size",
          requestId,
        }),
        { status: 413, headers: { "x-request-id": requestId } },
      );
    }

    let bodyJson: unknown;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        createApiErrorBody({ code: "INVALID_JSON", message: "Invalid JSON payload", requestId }),
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const parsed = enqueueSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json(
        createApiErrorBody({
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          requestId,
          details: { fieldErrors: parsed.error.flatten().fieldErrors },
        }),
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const { type, payload, priority, maxAttempts } = parsed.data;

    if (!isValidPayloadShape(payload)) {
      return NextResponse.json(
        createApiErrorBody({
          code: "VALIDATION_ERROR",
          message: "Job payload structure is not allowed",
          requestId,
        }),
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const privileged = await authorizePrivilegedRequest(request);
    const isAnonymousSafeType = type === "simulate_work" || type === "send_email_mock";
    if (!isAnonymousSafeType && !privileged.ok) {
      return NextResponse.json(
        createApiErrorBody({
          code: "UNAUTHORIZED",
          message: "Authentication required",
          requestId,
        }),
        { status: 401, headers: { "x-request-id": requestId } },
      );
    }

    const id = await enqueue(type as JobType, payload, { priority, maxAttempts, source });

    return NextResponse.json(
      { success: true, id },
      { status: 201, headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (err) {
    if (isMissingJobsTableError(err)) {
      return createJobQueueSchemaNotReadyResponse(requestId);
    }
    logError("job_queue.enqueue_failed", { requestId, error: formatError(err) });
    return NextResponse.json(
      createApiErrorBody({ code: "INTERNAL_ERROR", message: "Internal server error", requestId }),
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
