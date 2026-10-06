import { JobQueueDashboard } from "@/features/job-queue/components/JobQueueDashboard";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-zinc-500">
          Systems Demo
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Background Job Processing Dashboard
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          PostgreSQL-backed background job processing with priorities,
          retries, backoff, failure handling, and queue visibility.
        </p>
      </header>

      <JobQueueDashboard />
    </main>
  );
}
