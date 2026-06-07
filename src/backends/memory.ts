import type { Job, JobId, JobStatus, StorageAdapter } from "../types/index.js";
import { JobStatus as Status } from "../types/index.js";

/**
 * In-memory storage backend.
 * Fast, zero dependencies — great for development and testing.
 * Data is lost on process restart.
 */
export class MemoryBackend implements StorageAdapter {
  private queues = new Map<string, Map<JobId, Job>>();

  async init(): Promise<void> {
    // No initialization needed for in-memory
  }

  private getQueue(queueName: string): Map<JobId, Job> {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Map();
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  async addJob(queueName: string, job: Job): Promise<void> {
    const queue = this.getQueue(queueName);
    queue.set(job.id, structuredClone(job));
  }

  async getJob(queueName: string, jobId: JobId): Promise<Job | null> {
    const queue = this.getQueue(queueName);
    const job = queue.get(jobId);
    return job ? structuredClone(job) : null;
  }

  async getNextJob(queueName: string): Promise<Job | null> {
    const queue = this.getQueue(queueName);
    const now = Date.now();

    let best: Job | null = null;
    for (const job of queue.values()) {
      if (job.status !== Status.WAITING) continue;
      if (job.processAfter > now) continue;

      if (!best || job.priority < best.priority || (job.priority === best.priority && job.createdAt < best.createdAt)) {
        best = job;
      }
    }

    return best ? structuredClone(best) : null;
  }

  async updateJob(queueName: string, jobId: JobId, updates: Partial<Job>): Promise<void> {
    const queue = this.getQueue(queueName);
    const job = queue.get(jobId);
    if (!job) return;

    Object.assign(job, updates);
  }

  async removeJob(queueName: string, jobId: JobId): Promise<void> {
    const queue = this.getQueue(queueName);
    queue.delete(jobId);
  }

  async getJobsByStatus(queueName: string, status: JobStatus, limit = 100): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    const jobs: Job[] = [];

    for (const job of queue.values()) {
      if (job.status === status) {
        jobs.push(structuredClone(job));
        if (jobs.length >= limit) break;
      }
    }

    return jobs;
  }

  async getJobCounts(queueName: string): Promise<Record<JobStatus, number>> {
    const queue = this.getQueue(queueName);
    const counts: Record<string, number> = {
      [Status.WAITING]: 0,
      [Status.ACTIVE]: 0,
      [Status.COMPLETED]: 0,
      [Status.FAILED]: 0,
      [Status.DELAYED]: 0,
      [Status.DEAD]: 0,
    };

    for (const job of queue.values()) {
      counts[job.status] = (counts[job.status] ?? 0) + 1;
    }

    return counts as Record<JobStatus, number>;
  }

  async getReadyDelayedJobs(queueName: string): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    const now = Date.now();
    const ready: Job[] = [];

    for (const job of queue.values()) {
      if (job.status === Status.DELAYED && job.processAfter <= now) {
        ready.push(structuredClone(job));
      }
    }

    return ready;
  }

  async clean(queueName: string, olderThan: number, status?: JobStatus): Promise<number> {
    const queue = this.getQueue(queueName);
    const cutoff = Date.now() - olderThan;
    let removed = 0;

    for (const [id, job] of queue) {
      if (status && job.status !== status) continue;
      if (
        (job.status === Status.COMPLETED || job.status === Status.FAILED || job.status === Status.DEAD) &&
        job.updatedAt < cutoff
      ) {
        queue.delete(id);
        removed++;
      }
    }

    return removed;
  }

  async close(): Promise<void> {
    this.queues.clear();
  }
}
