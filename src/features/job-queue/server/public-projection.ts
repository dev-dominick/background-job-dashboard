import type { Job, JobStatus, JobType } from "@/features/job-queue";

export type PublicJobType = "simulate_work" | "send_email_mock" | "maintenance";

export type PublicJob = {
  id: string;
  type: PublicJobType;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  errorCategory: "none" | "transient" | "validation" | "internal";
};

function toPublicType(type: JobType): PublicJobType {
  if (type === "cleanup_expired_polls") {
    return "maintenance";
  }

  return type;
}

function toErrorCategory(error: string | null): PublicJob["errorCategory"] {
  if (!error) return "none";

  const normalized = error.toLowerCase();
  if (normalized.includes("invalid") || normalized.includes("validation")) {
    return "validation";
  }

  if (normalized.includes("timeout") || normalized.includes("temporary")) {
    return "transient";
  }

  return "internal";
}

export function toPublicJob(job: Job): PublicJob {
  return {
    id: job.id,
    type: toPublicType(job.type),
    status: job.status,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    scheduledAt: job.scheduled_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    createdAt: job.created_at,
    errorCategory: toErrorCategory(job.error),
  };
}
