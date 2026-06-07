import { describe, it, expect } from "vitest";
import {
  QueueBoltError,
  JobNotFoundError,
  JobTimeoutError,
  DuplicateJobError,
  QueueClosedError,
} from "../../src/utils/errors.js";

describe("Custom Errors", () => {
  it("QueueBoltError", () => {
    const err = new QueueBoltError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("QueueBoltError");
  });

  it("JobNotFoundError", () => {
    const err = new JobNotFoundError("abc-123");
    expect(err.message).toContain("abc-123");
    expect(err).toBeInstanceOf(QueueBoltError);
  });

  it("JobTimeoutError", () => {
    const err = new JobTimeoutError("job-1", 5000);
    expect(err.message).toContain("timed out");
    expect(err.jobId).toBe("job-1");
  });

  it("DuplicateJobError", () => {
    const err = new DuplicateJobError("dup-1");
    expect(err.message).toContain("already exists");
  });

  it("QueueClosedError", () => {
    const err = new QueueClosedError("my-queue");
    expect(err.message).toContain("closed");
  });
});
