import { describe, it, expect, beforeEach } from "vitest";
import { MemoryBackend } from "../../src/backends/memory.js";
import { JobStatus } from "../../src/types/index.js";
import type { Job } from "../../src/types/index.js";

function createJob(overrides: Partial<Job> = {}): Job {
  const now = Date.now();
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    name: "test-job",
    data: {},
    status: JobStatus.WAITING,
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    timeout: 30000,
    deadLetter: true,
    delay: 0,
    processAfter: now,
    createdAt: now,
    updatedAt: now,
    meta: {},
    ...overrides,
  };
}

describe("MemoryBackend", () => {
  let backend: MemoryBackend;

  beforeEach(async () => {
    backend = new MemoryBackend();
    await backend.init();
  });

  it("should add and retrieve a job", async () => {
    const job = createJob({ id: "j1" });
    await backend.addJob("q1", job);

    const fetched = await backend.getJob("q1", "j1");
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe("j1");
  });

  it("should return null for nonexistent job", async () => {
    const fetched = await backend.getJob("q1", "nope");
    expect(fetched).toBeNull();
  });

  it("should get the next job by priority", async () => {
    const low = createJob({ id: "low", priority: 10 });
    const high = createJob({ id: "high", priority: -5 });
    const normal = createJob({ id: "normal", priority: 0 });

    await backend.addJob("q1", low);
    await backend.addJob("q1", normal);
    await backend.addJob("q1", high);

    const next = await backend.getNextJob("q1");
    expect(next!.id).toBe("high");
  });

  it("should not return delayed jobs that aren't ready", async () => {
    const future = createJob({ id: "future", processAfter: Date.now() + 60000 });
    await backend.addJob("q1", future);

    const next = await backend.getNextJob("q1");
    expect(next).toBeNull();
  });

  it("should update a job", async () => {
    const job = createJob({ id: "j1" });
    await backend.addJob("q1", job);
    await backend.updateJob("q1", "j1", { status: JobStatus.ACTIVE });

    const updated = await backend.getJob("q1", "j1");
    expect(updated!.status).toBe(JobStatus.ACTIVE);
  });

  it("should remove a job", async () => {
    const job = createJob({ id: "j1" });
    await backend.addJob("q1", job);
    await backend.removeJob("q1", "j1");

    const fetched = await backend.getJob("q1", "j1");
    expect(fetched).toBeNull();
  });

  it("should count jobs by status", async () => {
    await backend.addJob("q1", createJob({ status: JobStatus.WAITING }));
    await backend.addJob("q1", createJob({ status: JobStatus.WAITING }));
    await backend.addJob("q1", createJob({ status: JobStatus.COMPLETED }));

    const counts = await backend.getJobCounts("q1");
    expect(counts[JobStatus.WAITING]).toBe(2);
    expect(counts[JobStatus.COMPLETED]).toBe(1);
    expect(counts[JobStatus.ACTIVE]).toBe(0);
  });

  it("should find ready delayed jobs", async () => {
    const ready = createJob({ status: JobStatus.DELAYED, processAfter: Date.now() - 1000 });
    const notReady = createJob({ status: JobStatus.DELAYED, processAfter: Date.now() + 60000 });

    await backend.addJob("q1", ready);
    await backend.addJob("q1", notReady);

    const results = await backend.getReadyDelayedJobs("q1");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(ready.id);
  });

  it("should clean old completed jobs", async () => {
    const old = createJob({
      status: JobStatus.COMPLETED,
      updatedAt: Date.now() - 100000,
    });
    const recent = createJob({
      status: JobStatus.COMPLETED,
      updatedAt: Date.now(),
    });

    await backend.addJob("q1", old);
    await backend.addJob("q1", recent);

    const removed = await backend.clean("q1", 50000);
    expect(removed).toBe(1);
  });

  it("should isolate queues", async () => {
    await backend.addJob("q1", createJob({ id: "a" }));
    await backend.addJob("q2", createJob({ id: "b" }));

    expect(await backend.getJob("q1", "a")).toBeDefined();
    expect(await backend.getJob("q1", "b")).toBeNull();
    expect(await backend.getJob("q2", "b")).toBeDefined();
  });
});
