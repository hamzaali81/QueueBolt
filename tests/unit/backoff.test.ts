import { describe, it, expect } from "vitest";
import { calculateBackoff } from "../../src/utils/backoff.js";

describe("calculateBackoff", () => {
  it("should return fixed delay regardless of attempt", () => {
    const delay = calculateBackoff({ type: "fixed", delay: 1000 }, 1);
    expect(delay).toBe(1000);

    const delay2 = calculateBackoff({ type: "fixed", delay: 1000 }, 5);
    expect(delay2).toBe(1000);
  });

  it("should increase exponentially", () => {
    const opts = { type: "exponential" as const, delay: 1000, maxDelay: 100000 };

    const d1 = calculateBackoff(opts, 1);
    const d2 = calculateBackoff(opts, 2);
    const d3 = calculateBackoff(opts, 3);

    // Allow for jitter (10%)
    expect(d1).toBeGreaterThanOrEqual(1000);
    expect(d1).toBeLessThanOrEqual(1200);

    expect(d2).toBeGreaterThanOrEqual(2000);
    expect(d2).toBeLessThanOrEqual(2200);

    expect(d3).toBeGreaterThanOrEqual(4000);
    expect(d3).toBeLessThanOrEqual(4200);
  });

  it("should cap at maxDelay", () => {
    const opts = { type: "exponential" as const, delay: 1000, maxDelay: 5000 };
    const delay = calculateBackoff(opts, 10); // would be 512000 without cap
    expect(delay).toBeLessThanOrEqual(5000);
  });
});
