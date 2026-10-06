import { describe, expect, it } from "vitest";
import { nextRunAt } from "./retry";

describe("nextRunAt (job queue retry backoff)", () => {
  it("returns a Date in the future", () => {
    const now = Date.now();
    const next = nextRunAt(1);
    expect(next.getTime()).toBeGreaterThan(now);
  });

  it("attempt 1 delays approximately 10 seconds (2^1 * 5000ms)", () => {
    const before = Date.now();
    const next = nextRunAt(1);
    const diff = next.getTime() - before;
    // Allow 500ms tolerance for execution time
    expect(diff).toBeGreaterThanOrEqual(9500);
    expect(diff).toBeLessThan(10500);
  });

  it("attempt 2 delays approximately 20 seconds (2^2 * 5000ms)", () => {
    const before = Date.now();
    const next = nextRunAt(2);
    const diff = next.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(19500);
    expect(diff).toBeLessThan(20500);
  });

  it("attempt 3 delays approximately 40 seconds (2^3 * 5000ms)", () => {
    const before = Date.now();
    const next = nextRunAt(3);
    const diff = next.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(39500);
    expect(diff).toBeLessThan(40500);
  });

  it("delays grow exponentially", () => {
    const d1 = nextRunAt(1).getTime() - Date.now();
    const d2 = nextRunAt(2).getTime() - Date.now();
    const d3 = nextRunAt(3).getTime() - Date.now();
    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
  });
});
