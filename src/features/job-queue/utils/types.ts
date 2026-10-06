export type JobStatus = "pending" | "running" | "completed" | "failed" | "dead";
export type JobType = "simulate_work" | "cleanup_expired_polls" | "send_email_mock";

export type Job = {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  scheduled_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  error: string | null;
  created_at: Date;
  source: string | null;
};

export type JobStats = {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
};
