import type { Job, JobId, JobStatus, StorageAdapter } from "../types/index.js";
import { JobStatus as Status } from "../types/index.js";

/**
 * Redis storage backend using ioredis.
 * Production-grade — supports distributed workers, persistence, and horizontal scaling.
 *
 * @example
 * ```ts
 * import { Queue } from "queuebolt";
 * import { RedisBackend } from "queuebolt/backends/redis";
 *
 * const queue = new Queue("emails", {
 *   backend: new RedisBackend({ host: "localhost", port: 6379 }),
 * });
 * ```
 */
export class RedisBackend implements StorageAdapter {
  private redis: import("ioredis").Redis | null = null;
  private readonly connectionOptions: Record<string, unknown>;
  private readonly keyPrefix: string;

  constructor(options: Record<string, unknown> = {}, keyPrefix = "queuebolt") {
    this.connectionOptions = options;
    this.keyPrefix = keyPrefix;
  }

  private key(queueName: string, ...parts: string[]): string {
    return [this.keyPrefix, queueName, ...parts].join(":");
  }

  async init(): Promise<void> {
    const { default: Redis } = await import("ioredis");
    this.redis = new Redis(this.connectionOptions as ConstructorParameters<typeof Redis>[0]);
  }

  private getClient(): import("ioredis").Redis {
    if (!this.redis) throw new Error("Redis backend not initialized. Call init() first.");
    return this.redis;
  }

  async addJob(queueName: string, job: Job): Promise<void> {
    const client = this.getClient();
    const jobKey = this.key(queueName, "jobs", job.id);
    const statusKey = this.key(queueName, "status", job.status);

    await client
      .multi()
      .set(jobKey, JSON.stringify(job))
      .zadd(statusKey, job.priority, job.id)
      .exec();
  }

  async getJob(queueName: string, jobId: JobId): Promise<Job | null> {
    const client = this.getClient();
    const data = await client.get(this.key(queueName, "jobs", jobId));
    return data ? (JSON.parse(data) as Job) : null;
  }

  async getNextJob(queueName: string): Promise<Job | null> {
    const client = this.getClient();
    const statusKey = this.key(queueName, "status", Status.WAITING);

    // Get all waiting job IDs sorted by priority
    const jobIds = await client.zrange(statusKey, 0, -1);
    const now = Date.now();

    for (const jobId of jobIds) {
      const job = await this.getJob(queueName, jobId);
      if (job && job.status === Status.WAITING && job.processAfter <= now) {
        return job;
      }
    }

    return null;
  }

  async updateJob(queueName: string, jobId: JobId, updates: Partial<Job>): Promise<void> {
    const client = this.getClient();
    const job = await this.getJob(queueName, jobId);
    if (!job) return;

    const oldStatus = job.status;
    Object.assign(job, updates);
    const newStatus = job.status;

    const multi = client.multi().set(this.key(queueName, "jobs", jobId), JSON.stringify(job));

    if (oldStatus !== newStatus) {
      multi
        .zrem(this.key(queueName, "status", oldStatus), jobId)
        .zadd(this.key(queueName, "status", newStatus), job.priority, jobId);
    }

    await multi.exec();
  }

  async removeJob(queueName: string, jobId: JobId): Promise<void> {
    const client = this.getClient();
    const job = await this.getJob(queueName, jobId);
    if (!job) return;

    await client
      .multi()
      .del(this.key(queueName, "jobs", jobId))
      .zrem(this.key(queueName, "status", job.status), jobId)
      .exec();
  }

  async getJobsByStatus(queueName: string, status: JobStatus, limit = 100): Promise<Job[]> {
    const client = this.getClient();
    const statusKey = this.key(queueName, "status", status);
    const jobIds = await client.zrange(statusKey, 0, limit - 1);

    const jobs: Job[] = [];
    for (const id of jobIds) {
      const job = await this.getJob(queueName, id);
      if (job) jobs.push(job);
    }

    return jobs;
  }

  async getJobCounts(queueName: string): Promise<Record<JobStatus, number>> {
    const client = this.getClient();
    const statuses = Object.values(Status);

    const counts: Record<string, number> = {};
    for (const status of statuses) {
      counts[status] = await client.zcard(this.key(queueName, "status", status));
    }

    return counts as Record<JobStatus, number>;
  }

  async getReadyDelayedJobs(queueName: string): Promise<Job[]> {
    const client = this.getClient();
    const statusKey = this.key(queueName, "status", Status.DELAYED);
    const jobIds = await client.zrange(statusKey, 0, -1);
    const now = Date.now();
    const ready: Job[] = [];

    for (const id of jobIds) {
      const job = await this.getJob(queueName, id);
      if (job && job.processAfter <= now) {
        ready.push(job);
      }
    }

    return ready;
  }

  async clean(queueName: string, olderThan: number, status?: JobStatus): Promise<number> {
    const targetStatuses = status
      ? [status]
      : [Status.COMPLETED, Status.FAILED, Status.DEAD];

    let removed = 0;
    const cutoff = Date.now() - olderThan;

    for (const s of targetStatuses) {
      const jobs = await this.getJobsByStatus(queueName, s, 1000);
      for (const job of jobs) {
        if (job.updatedAt < cutoff) {
          await this.removeJob(queueName, job.id);
          removed++;
        }
      }
    }

    return removed;
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
