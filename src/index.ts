/**
 * QueueBolt — A lightweight, reliable background job queue for Node.js.
 *
 * @packageDocumentation
 */

// Core
export { Queue } from "./core/queue.js";

// Types
export type {
  Job,
  JobId,
  JobData,
  JobResult,
  JobOptions,
  BackoffOptions,
  QueueOptions,
  QueueEventMap,
  ProcessorFn,
  StorageAdapter,
  ScheduleOptions,
} from "./types/index.js";

export { JobStatus, JobPriority } from "./types/index.js";

// Backends
export { MemoryBackend } from "./backends/memory.js";

// Errors
export {
  QueueBoltError,
  JobNotFoundError,
  JobTimeoutError,
  DuplicateJobError,
  QueueClosedError,
} from "./utils/errors.js";

// Utilities
export { generateId } from "./utils/id.js";
export { calculateBackoff } from "./utils/backoff.js";
