type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

/** Strip characters that could break structured log parsing (newlines, control chars). */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/[\x00-\x1f\x7f]/g, "");
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(v)]),
    );
  }
  return value;
}

function write(level: LogLevel, event: string, context?: LogContext) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...(context ? { context: sanitizeValue(context) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "info") {
    console.log(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.error(line);
}

export function logInfo(event: string, context?: LogContext) {
  write("info", event, context);
}

export function logWarn(event: string, context?: LogContext) {
  write("warn", event, context);
}

export function logError(event: string, context?: LogContext) {
  write("error", event, context);
}

/** Extract a meaningful message from an unknown caught value. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
