/**
 * Custom error types for QueueBolt.
 */

export class QueueBoltError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueBoltError";
  }
}

export class JobNotFoundError extends QueueBoltError {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = "JobNotFoundError";
  }
}

export class JobTimeoutError extends QueueBoltError {
  public readonly jobId: string;

  constructor(jobId: string, timeout: number) {
    super(`Job ${jobId} timed out after ${timeout}ms`);
    this.name = "JobTimeoutError";
    this.jobId = jobId;
  }
}

export class DuplicateJobError extends QueueBoltError {
  constructor(jobId: string) {
    super(`Job with ID "${jobId}" already exists`);
    this.name = "DuplicateJobError";
  }
}

export class QueueClosedError extends QueueBoltError {
  constructor(queueName: string) {
    super(`Queue "${queueName}" is closed`);
    this.name = "QueueClosedError";
  }
}
