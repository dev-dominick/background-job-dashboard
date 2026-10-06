/**
 * Exponential backoff for job retries.
 * attempt 1 → 5s, 2 → 10s, 3 → 20s, ...
 */
export function nextRunAt(attempts: number): Date {
  const delayMs = Math.pow(2, attempts) * 5_000;
  return new Date(Date.now() + delayMs);
}
