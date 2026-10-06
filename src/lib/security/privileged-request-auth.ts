export type PrivilegedRequestAuthResult =
  | { ok: true; source: "standalone_demo" }
  | { ok: false };

/**
 * Standalone demo authorization.
 *
 * The original portfolio routes used portfolio admin sessions and internal
 * secrets. Those concerns do not belong in this extracted public demo.
 *
 * Creating jobs remains restricted by the route's existing anonymous-safe
 * type check. Operational demo controls such as process, retry, and delete
 * are intentionally available so the queue lifecycle can be exercised.
 */
export async function authorizePrivilegedRequest(
  request: Request,
): Promise<PrivilegedRequestAuthResult> {
  const url = new URL(request.url);

  if (
    request.method === "POST" &&
    url.pathname === "/api/projects/job-queue/jobs"
  ) {
    return { ok: false };
  }

  return { ok: true, source: "standalone_demo" };
}

export async function isCurrentAdminAuthorized(): Promise<boolean> {
  return true;
}
