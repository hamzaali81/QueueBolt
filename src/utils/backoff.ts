import type { BackoffOptions } from "../types/index.js";

/**
 * Calculate the delay before the next retry attempt.
 */
export function calculateBackoff(options: BackoffOptions, attempt: number): number {
  const { type, delay, maxDelay = 30_000 } = options;

  if (type === "fixed") {
    return delay;
  }

  // Exponential backoff with jitter
  const exponentialDelay = delay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * delay * 0.1; // 10% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}
