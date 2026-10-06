# Background Job Processing Dashboard

A standalone full-stack job queue demo built with Next.js, TypeScript, React, and PostgreSQL.

## Highlights

- Durable PostgreSQL-backed job queue
- Atomic dequeue with `FOR UPDATE SKIP LOCKED`
- Pending, running, completed, failed, and dead states
- Retry scheduling and attempt tracking
- Priority and scheduled execution
- Stale-running job recovery
- Create, process, retry, and delete APIs
- Server-Sent Events for live queue updates
- Structured validation and API errors
- Operational React dashboard with queue metrics

## Stack

Next.js 16, React 19, TypeScript, PostgreSQL, Tailwind CSS, Zod, Vitest, and Testing Library.

## Local setup

Requirements: PostgreSQL and pnpm.

1. Create the database: `createdb background_job_dashboard`
2. Copy `.env.example` to `.env.local` and update `DATABASE_URL` if needed.
3. Run the migration: `psql "$DATABASE_URL" -f db/migrations/001_job_queue.sql`
4. Install dependencies: `pnpm install`
5. Start the application: `pnpm dev`

Open `http://localhost:3000`.

## Validation

Run:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Architecture

Queue operations live in `src/features/job-queue`.

Jobs are persisted in PostgreSQL. Workers claim eligible jobs transactionally using `FOR UPDATE SKIP LOCKED`, which prevents concurrent workers from processing the same job.

Failed jobs are rescheduled while retry attempts remain. Jobs that exhaust their attempts transition to the dead state.

The API exposes queue lifecycle operations, while the dashboard provides visibility into state, attempts, processing, and aggregate queue metrics.

## Database

The standalone schema is in `db/migrations/001_job_queue.sql`.
