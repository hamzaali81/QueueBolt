import { EventEmitter } from "node:events";
import type {
  Job,
  JobData,
  JobId,
  JobOptions,
  JobResult,
  JobStatus,
  ProcessorFn,
  QueueEventMap,
  QueueOptions,
  StorageAdapter,
} from "../types/index.js";
import { JobStatus as Status } from "../types/index.js";
import { MemoryBackend } from "../backends/memory.js";
import { generateId } from "../utils/id.js";
import { calculateBackoff } from "../utils/backoff.js";
import { DuplicateJobError, JobNotFoundError, JobTimeoutError, QueueClosedError } from "../utils/errors.js";

/**
 * QueueBolt — a lightweight, reliable background job queue.
 *
 * @example
 * ```ts
 * import { Queue } from "queuebolt";
 *
 * const queue = new Queue("emails");
 *
 * queue.process(async (job) => {
 *   await sendEmail(job.data.to, job.data.subject, job.data.body);
 *   return { sent: true };
 * });
 *
 * await queue.add("send-welcome", { to: "user@example.com", subject: "Welcome!" });
 * ```
 */
export class Queue<
  TData extends JobData = JobData,
  TResult extends JobResult = JobResult,
> extends EventEmitter {
  public readonly name: string;
  private readonly backend: StorageAdapter;
  private readonly defaultJobOptions: Partial<JobOptions>;
  private readonly concurrency: number;
  private readonly pollInterval: number;

  private processor: ProcessorFn<TData, TResult> | null = null;
  private activeCount = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private paused = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(name: string, options: QueueOptions = {}) {
    super();
    this.name = name;
    this.backend = options.backend ?? new MemoryBackend();
    this.defaultJobOptions = options.defaultJobOptions ?? {};
    this.concurrency = options.concurrency ?? 1;
    this.pollInterval = options.pollInterval ?? 1000;
  }

  // ─── Lifecycle ───────────────────────────────────────────

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.backend.init().then(() => {
        this.initialized = true;
      });
    }
    await this.initPromise;
  }

  // ─── Adding Jobs ─────────────────────────────────────────

  /**
   * Add a job to the queue.
   */
  async add(name: string, data: TData, options: Partial<JobOptions> = {}): Promise<Job<TData, TResult>> {
    if (this.closed) throw new QueueClosedError(this.name);
    await this.ensureInit();

    const merged = { ...this.defaultJobOptions, ...options };
    const now = Date.now();
    const delay = merged.delay ?? 0;
    const jobId = merged.jobId ?? generateId();

    // Check for duplicate custom IDs
    if (merged.jobId) {
      const existing = await this.backend.getJob(this.name, jobId);
      if (existing) throw new DuplicateJobError(jobId);
    }

    const job: Job<TData, TResult> = {
      id: jobId,
      name,
      data,
      status: delay > 0 ? Status.DELAYED : Status.WAITING,
      priority: merged.priority ?? 0,
      attempts: 0,
      maxAttempts: merged.attempts ?? 3,
      backoff: merged.backoff ?? { type: "exponential", delay: 1000 },
      timeout: merged.timeout ?? 30_000,
      deadLetter: merged.deadLetter ?? true,
      delay,
      processAfter: now + delay,
      createdAt: now,
      updatedAt: now,
      meta: merged.meta ?? {},
    };

    await this.backend.addJob(this.name, job);
    this.emit("job:added", job);
    this.tryProcess();

    return job;
  }

  /**
   * Add multiple jobs in bulk.
   */
  async addBulk(
    jobs: Array<{ name: string; data: TData; options?: Partial<JobOptions> }>,
  ): Promise<Job<TData, TResult>[]> {
    const results: Job<TData, TResult>[] = [];
    for (const { name, data, options } of jobs) {
      results.push(await this.add(name, data, options ?? {}));
    }
    return results;
  }

  // ─── Processing ──────────────────────────────────────────

  /**
   * Register a processor function for this queue.
   * Starts processing immediately.
   */
  process(fn: ProcessorFn<TData, TResult>): void {
    if (this.processor) {
      throw new Error(`Queue "${this.name}" already has a processor registered`);
    }
    this.processor = fn;
    this.startPolling();
    this.tryProcess();
  }

  private startPolling(): void {
    if (this.pollTimer) return;

    this.pollTimer = setInterval(async () => {
      if (this.closed) return;

      try {
        // Promote delayed jobs that are now ready
        await this.ensureInit();
        const readyJobs = await this.backend.getReadyDelayedJobs(this.name);
        for (const job of readyJobs) {
          await this.backend.updateJob(this.name, job.id, {
            status: Status.WAITING,
            updatedAt: Date.now(),
          });
        }

        this.tryProcess();
      } catch (err) {
        this.emit("queue:error", err instanceof Error ? err : new Error(String(err)));
      }
    }, this.pollInterval);

    // Don't keep the process alive just for polling
    if (this.pollTimer.unref) {
      this.pollTimer.unref();
    }
  }

  private async tryProcess(): Promise<void> {
    if (!this.processor || this.closed || this.paused) return;
    if (this.activeCount >= this.concurrency) return;

    await this.ensureInit();
    const rawJob = await this.backend.getNextJob(this.name);
    if (!rawJob) return;

    const job = rawJob as Job<TData, TResult>;
    this.activeCount++;

    // Mark as active
    const now = Date.now();
    await this.backend.updateJob(this.name, job.id, {
      status: Status.ACTIVE,
      startedAt: now,
      updatedAt: now,
      attempts: job.attempts + 1,
    });
    job.status = Status.ACTIVE;
    job.startedAt = now;
    job.attempts += 1;

    this.emit("job:active", job);

    try {
      const result = await this.executeWithTimeout(job);

      // Success
      const completedAt = Date.now();
      await this.backend.updateJob(this.name, job.id, {
        status: Status.COMPLETED,
        result,
        completedAt,
        updatedAt: completedAt,
      });
      job.status = Status.COMPLETED;
      job.result = result;
      job.completedAt = completedAt;

      this.emit("job:completed", job);
    } catch (err) {
      await this.handleFailure(job, err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.activeCount--;
      // Try to pick up more work
      this.tryProcess();

      // Check if drained
      if (this.activeCount === 0) {
        const counts = await this.backend.getJobCounts(this.name);
        if (counts[Status.WAITING] === 0 && counts[Status.DELAYED] === 0) {
          this.emit("queue:drained");
        }
      }
    }
  }

  private executeWithTimeout(job: Job<TData, TResult>): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new JobTimeoutError(job.id, job.timeout));
      }, job.timeout);

      this.processor!(job)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private async handleFailure(job: Job<TData, TResult>, error: Error): Promise<void> {
    const now = Date.now();

    if (job.attempts < job.maxAttempts) {
      // Retry with backoff
      const backoffDelay = calculateBackoff(job.backoff, job.attempts);
      const processAfter = now + backoffDelay;

      await this.backend.updateJob(this.name, job.id, {
        status: Status.DELAYED,
        error: error.message,
        stackTrace: error.stack,
        processAfter,
        failedAt: now,
        updatedAt: now,
      });

      job.status = Status.DELAYED;
      job.error = error.message;
      this.emit("job:retrying", job, job.attempts);
    } else if (job.deadLetter) {
      // Move to dead-letter queue
      await this.backend.updateJob(this.name, job.id, {
        status: Status.DEAD,
        error: error.message,
        stackTrace: error.stack,
        failedAt: now,
        updatedAt: now,
      });

      job.status = Status.DEAD;
      job.error = error.message;
      this.emit("job:dead", job);
    } else {
      // Permanently failed
      await this.backend.updateJob(this.name, job.id, {
        status: Status.FAILED,
        error: error.message,
        stackTrace: error.stack,
        failedAt: now,
        updatedAt: now,
      });

      job.status = Status.FAILED;
      job.error = error.message;
      this.emit("job:failed", job, error);
    }
  }

  // ─── Job Management ──────────────────────────────────────

  /** Get a job by its ID. */
  async getJob(jobId: JobId): Promise<Job<TData, TResult> | null> {
    await this.ensureInit();
    return this.backend.getJob(this.name, jobId) as Promise<Job<TData, TResult> | null>;
  }

  /** Remove a job by its ID. */
  async removeJob(jobId: JobId): Promise<void> {
    await this.ensureInit();
    const job = await this.backend.getJob(this.name, jobId);
    if (!job) throw new JobNotFoundError(jobId);
    await this.backend.removeJob(this.name, jobId);
  }

  /** Retry a failed or dead job. */
  async retryJob(jobId: JobId): Promise<void> {
    await this.ensureInit();
    const job = await this.backend.getJob(this.name, jobId);
    if (!job) throw new JobNotFoundError(jobId);

    if (job.status !== Status.FAILED && job.status !== Status.DEAD) {
      throw new Error(`Cannot retry job in "${job.status}" status`);
    }

    await this.backend.updateJob(this.name, jobId, {
      status: Status.WAITING,
      attempts: 0,
      error: undefined,
      stackTrace: undefined,
      processAfter: Date.now(),
      updatedAt: Date.now(),
    });

    this.tryProcess();
  }

  /** Get jobs filtered by status. */
  async getJobs(status: JobStatus, limit?: number): Promise<Job<TData, TResult>[]> {
    await this.ensureInit();
    return this.backend.getJobsByStatus(this.name, status, limit) as Promise<Job<TData, TResult>[]>;
  }

  /** Get job counts by status. */
  async getJobCounts(): Promise<Record<JobStatus, number>> {
    await this.ensureInit();
    return this.backend.getJobCounts(this.name);
  }

  /** Remove old completed/failed jobs. */
  async clean(olderThan: number, status?: JobStatus): Promise<number> {
    await this.ensureInit();
    return this.backend.clean(this.name, olderThan, status);
  }

  /** Pause processing (stops picking new jobs). */
  pause(): void {
    this.paused = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Resume processing. */
  resume(): void {
    this.paused = false;
    if (this.processor && !this.pollTimer) {
      this.startPolling();
      this.tryProcess();
    }
  }

  /** Gracefully shut down the queue. */
  async close(): Promise<void> {
    this.closed = true;
    this.pause();

    // Wait for active jobs to complete (with a timeout)
    const timeout = 10_000;
    const start = Date.now();
    while (this.activeCount > 0 && Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, 100));
    }

    await this.backend.close();
    this.removeAllListeners();
  }

  // ─── Type-safe event emitter overrides ───────────────────

  override on<K extends keyof QueueEventMap>(event: K, listener: QueueEventMap[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof QueueEventMap>(event: K, listener: QueueEventMap[K]): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof QueueEventMap>(
    event: K,
    ...args: Parameters<QueueEventMap[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
