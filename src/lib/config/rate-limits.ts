export type RateLimitPolicy = {
  maxRequests: number;
  windowMs: number;
  methods?: ReadonlyArray<string>;
};

export const RATE_LIMITS: Record<string, RateLimitPolicy> = {
  "/api/health": { maxRequests: 60, windowMs: 60_000, methods: ["GET"] },
  "/api/readiness": { maxRequests: 60, windowMs: 60_000, methods: ["GET"] },
  "/api/contact": { maxRequests: 5, windowMs: 60_000, methods: ["POST"] },
  "/api/auth/callback/credentials": {
    maxRequests: 5,
    windowMs: 15 * 60_000,
    methods: ["POST"],
  },
  "/api/auth/signin": { maxRequests: 5, windowMs: 15 * 60_000, methods: ["POST"] },
  "/admin/setup": { maxRequests: 5, windowMs: 15 * 60_000, methods: ["POST"] },
  "/admin/recover": { maxRequests: 5, windowMs: 15 * 60_000, methods: ["POST"] },
  "/text-editor": { maxRequests: 120, windowMs: 60_000 },
  "/weather-app-nextjs": { maxRequests: 120, windowMs: 60_000 },
  "/api/projects/polls": { maxRequests: 30, windowMs: 60_000, methods: ["POST"] },
  "/api/projects/polls/": { maxRequests: 60, windowMs: 60_000, methods: ["GET"] },
  "/api/projects/polls/*": { maxRequests: 20, windowMs: 60_000, methods: ["DELETE"] },
  "/api/projects/polls/*/vote": { maxRequests: 10, windowMs: 60_000, methods: ["POST"] },
  "/api/projects/taskboard": { maxRequests: 60, windowMs: 60_000 },
  "/api/projects/job-queue/jobs": { maxRequests: 30, windowMs: 60_000, methods: ["POST"] },
  "/api/projects/job-queue/jobs/": { maxRequests: 60, windowMs: 60_000, methods: ["GET"] },
  "/api/projects/job-queue/jobs/*": {
    maxRequests: 30,
    windowMs: 60_000,
    methods: ["DELETE"],
  },
  "/api/projects/job-queue/jobs/*/retry": {
    maxRequests: 30,
    windowMs: 60_000,
    methods: ["POST"],
  },
  "/api/projects/job-queue/process": { maxRequests: 120, windowMs: 60_000, methods: ["POST"] },
  "/api/projects/job-queue/stream": { maxRequests: 30, windowMs: 60_000, methods: ["GET"] },
  "/api/projects/flags": { maxRequests: 60, windowMs: 60_000 },
  "/api/projects/flags/": { maxRequests: 60, windowMs: 60_000 },
  "/projects/polls": { maxRequests: 120, windowMs: 60_000 },
  "/projects/taskboard": { maxRequests: 120, windowMs: 60_000 },
  "/projects/text-editor": { maxRequests: 120, windowMs: 60_000 },
  "/projects/job-queue": { maxRequests: 120, windowMs: 60_000 },
  "/projects/flags": { maxRequests: 120, windowMs: 60_000 },
  "/projects/weather": { maxRequests: 120, windowMs: 60_000 },
};

export const DEMO_ROUTE_PREFIXES = [
  "/app/",
  "/apps/",
  "/text-editor",
  "/weather-app-nextjs",
  "/projects/polls",
  "/projects/taskboard",
  "/projects/text-editor",
  "/projects/job-queue",
  "/projects/flags",
  "/projects/weather",
];
