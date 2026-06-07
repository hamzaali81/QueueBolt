import { randomBytes } from "node:crypto";

/**
 * Generate a unique job ID.
 * Format: timestamp-random (collision-resistant, sortable).
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString("hex");
  return `${timestamp}-${random}`;
}
