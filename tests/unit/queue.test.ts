import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Queue, JobStatus, JobPriority, MemoryBackend } from "../../src/index.js";

describe("Queue", () => {
  let queue: Queue;

  beforeEach(() => {
    queue = new Queue("test-queue", {
      backend: new MemoryBackend(),
      pollInterval: 50,
    });
  });

  afterEach(async () => {
    await queue.close();
  });

  // ─── Job Addition ──────────────────────────────────────

  describe("add()", () => {
    it("should add a job and return it", async () => {
      const job = await queue.add("send-email", { to: "user@example.com" });

      expect(job).toBeDefined();
      expect(job.id).toBeTruthy();
      expect(job.name).toBe("send-email");
      expect(job.data).toEqual({ to: "user@example.com" });
      expect(job.status).toBe(JobStatus.WAITING);
      expect(job.attempts).toBe(0);
    });

    it("should support custom job IDs", async () => {
      const job = await queue.add("task", { x: 1 }, { jobId: "custom-123" });
      expect(job.id).toBe("custom-123");
    });

    it("should reject duplicate custom job IDs", async () => {
      await queue.add("task", { x: 1 }, { jobId: "dup-1" });
      await expect(queue.add("task", { x: 2 }, { jobId: "dup-1" })).rejects.toThrow(
        "already exists",
      );
    });

    it("should apply default job options", async () => {
      const q = new Queue("defaults", {
        backend: new MemoryBackend(),
        defaultJobOptions: { attempts: 5, timeout: 60000 },
      });

      const job = await q.add("task", {});
      expect(job.maxAttempts).toBe(5);
      expect(job.timeout).toBe(60000);
      await q.close();
    });

    it("should create delayed jobs", async () => {
      const job = await queue.add("task", {}, { delay: 5000 });
      expect(job.status).toBe(JobStatus.DELAYED);
      expect(job.processAfter).toBeGreaterThan(Date.now() - 100);
    });

    it("should set job priority", async () => {
      const job = await queue.add("task", {}, { priority: JobPriority.HIGH });
      expect(job.priority).toBe(JobPriority.HIGH);
    });
  });

  describe("addBulk()", () => {
    it("should add multiple jobs", async () => {
      const jobs = await queue.addBulk([
        { name: "task-1", data: { i: 1 } },
        { name: "task-2", data: { i: 2 } },
        { name: "task-3", data: { i: 3 } },
      ]);

      expect(jobs).toHaveLength(3);
      expect(jobs[0].name).toBe("task-1");
      expect(jobs[2].name).toBe("task-3");
    });
  });

  // ─── Processing ────────────────────────────────────────

  describe("process()", () => {
    it("should process a job and mark it completed", async () => {
      const completed = new Promise<void>((resolve) => {
        queue.on("job:completed", () => resolve());
      });

      queue.process(async (job) => {
        return { processed: job.data };
      });

      await queue.add("task", { value: 42 });
      await completed;

      const counts = await queue.getJobCounts();
      expect(counts[JobStatus.COMPLETED]).toBe(1);
    });

    it("should respect concurrency", async () => {
      const q = new Queue("concurrent", {
        backend: new MemoryBackend(),
        concurrency: 2,
        pollInterval: 50,
      });

      let maxConcurrent = 0;
      let currentActive = 0;

      q.process(async () => {
        currentActive++;
        maxConcurrent = Math.max(maxConcurrent, currentActive);
        await new Promise((r) => setTimeout(r, 100));
        currentActive--;
        return {};
      });

      await q.addBulk([
        { name: "t1", data: {} },
        { name: "t2", data: {} },
        { name: "t3", data: {} },
      ]);

      // Wait for all to complete
      await new Promise((r) => setTimeout(r, 500));

      expect(maxConcurrent).toBeLessThanOrEqual(2);
      await q.close();
    });

    it("should not allow registering multiple processors", () => {
      queue.process(async () => ({}));
      expect(() => queue.process(async () => ({}))).toThrow("already has a processor");
    });
  });

  // ─── Retries & Dead Letter ─────────────────────────────

  describe("retry logic", () => {
    it("should retry failed jobs", async () => {
      let attempts = 0;
      const retried = new Promise<void>((resolve) => {
        queue.on("job:completed", () => resolve());
      });

      queue.process(async () => {
        attempts++;
        if (attempts < 3) throw new Error("fail");
        return { done: true };
      });

      await queue.add("retry-task", {}, {
        attempts: 3,
        backoff: { type: "fixed", delay: 50 },
      });

      await retried;
      expect(attempts).toBe(3);
    });

    it("should move to dead-letter queue after max retries", async () => {
      const dead = new Promise<void>((resolve) => {
        queue.on("job:dead", () => resolve());
      });

      queue.process(async () => {
        throw new Error("permanent failure");
      });

      await queue.add("doomed", {}, {
        attempts: 2,
        backoff: { type: "fixed", delay: 50 },
        deadLetter: true,
      });

      await dead;

      const counts = await queue.getJobCounts();
      expect(counts[JobStatus.DEAD]).toBe(1);
    });

    it("should mark as failed when deadLetter is false", async () => {
      const failed = new Promise<void>((resolve) => {
        queue.on("job:failed", () => resolve());
      });

      queue.process(async () => {
        throw new Error("no DLQ");
      });

      await queue.add("task", {}, {
        attempts: 1,
        deadLetter: false,
      });

      await failed;

      const counts = await queue.getJobCounts();
      expect(counts[JobStatus.FAILED]).toBe(1);
    });
  });

  // ─── Timeout ───────────────────────────────────────────

  describe("timeout", () => {
    it("should fail jobs that exceed timeout", async () => {
      const retrying = new Promise<void>((resolve) => {
        queue.on("job:retrying", () => resolve());
      });

      queue.process(async () => {
        await new Promise((r) => setTimeout(r, 5000));
        return {};
      });

      await queue.add("slow", {}, {
        timeout: 100,
        backoff: { type: "fixed", delay: 50 },
      });

      await retrying;

      const job = (await queue.getJobs(JobStatus.DELAYED))[0];
      expect(job.error).toContain("timed out");
    });
  });

  // ─── Job Management ───────────────────────────────────

  describe("job management", () => {
    it("should get a job by ID", async () => {
      const added = await queue.add("task", { x: 1 });
      const fetched = await queue.getJob(added.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(added.id);
    });

    it("should remove a job", async () => {
      const job = await queue.add("task", {});
      await queue.removeJob(job.id);
      const fetched = await queue.getJob(job.id);
      expect(fetched).toBeNull();
    });

    it("should retry a dead job", async () => {
      const dead = new Promise<void>((resolve) => {
        queue.on("job:dead", () => resolve());
      });

      let callCount = 0;
      queue.process(async () => {
        callCount++;
        if (callCount <= 1) throw new Error("fail");
        return { success: true };
      });

      const job = await queue.add("task", {}, {
        attempts: 1,
        backoff: { type: "fixed", delay: 10 },
        deadLetter: true,
      });

      await dead;
      await queue.retryJob(job.id);

      // Wait for reprocessing
      await new Promise((r) => setTimeout(r, 200));

      const updated = await queue.getJob(job.id);
      expect(updated!.status).toBe(JobStatus.COMPLETED);
    });

    it("should clean old jobs", async () => {
      queue.process(async () => ({}));

      await queue.add("task", {});
      await new Promise((r) => setTimeout(r, 200));

      const removed = await queue.clean(0);
      expect(removed).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Events ────────────────────────────────────────────

  describe("events", () => {
    it("should emit job:added", async () => {
      const handler = vi.fn();
      queue.on("job:added", handler);

      await queue.add("task", {});
      expect(handler).toHaveBeenCalledOnce();
    });

    it("should emit queue:drained", async () => {
      const drained = new Promise<void>((resolve) => {
        queue.on("queue:drained", () => resolve());
      });

      queue.process(async () => ({}));
      await queue.add("task", {});

      await drained; // resolves when queue is empty
    });
  });

  // ─── Pause / Resume ───────────────────────────────────

  describe("pause / resume", () => {
    it("should pause and resume processing", async () => {
      let processed = 0;

      // Pause before registering processor so add() can't immediately process
      queue.pause();

      queue.process(async () => {
        processed++;
        return {};
      });

      // Pause again to stop the polling that process() starts
      queue.pause();

      await queue.add("task-1", {});
      await new Promise((r) => setTimeout(r, 200));
      expect(processed).toBe(0); // paused, nothing processed

      queue.resume();
      await new Promise((r) => setTimeout(r, 300));
      expect(processed).toBe(1);
    });
  });

  // ─── Closed Queue ──────────────────────────────────────

  describe("closed queue", () => {
    it("should reject new jobs after close", async () => {
      await queue.close();
      await expect(queue.add("task", {})).rejects.toThrow("closed");
    });
  });
});
