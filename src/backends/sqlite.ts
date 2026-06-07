import type { Job, JobId, JobStatus, StorageAdapter } from "../types/index.js";
import { JobStatus as Status } from "../types/index.js";

/**
 * SQLite storage backend using better-sqlite3.
 * Persistent, zero-infrastructure — great for single-server deployments.
 *
 * @example
 * ```ts
 * import { Queue } from "queuebolt";
 * import { SQLiteBackend } from "queuebolt/backends/sqlite";
 *
 * const queue = new Queue("tasks", {
 *   backend: new SQLiteBackend("./queue.db"),
 * });
 * ```
 */
export class SQLiteBackend implements StorageAdapter {
  private db: import("better-sqlite3").Database | null = null;
  private readonly dbPath: string;

  constructor(dbPath = ":memory:") {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    const Database = (await import("better-sqlite3")).default;
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT NOT NULL,
        queue TEXT NOT NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        backoff TEXT NOT NULL,
        timeout INTEGER NOT NULL DEFAULT 30000,
        dead_letter INTEGER NOT NULL DEFAULT 1,
        result TEXT,
        error TEXT,
        stack_trace TEXT,
        delay INTEGER NOT NULL DEFAULT 0,
        process_after INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        failed_at INTEGER,
        meta TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (queue, id)
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (queue, status, priority, created_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_delayed ON jobs (queue, status, process_after);
    `);
  }

  private getDb(): import("better-sqlite3").Database {
    if (!this.db) throw new Error("SQLite backend not initialized. Call init() first.");
    return this.db;
  }

  private jobToRow(queueName: string, job: Job): Record<string, unknown> {
    return {
      id: job.id,
      queue: queueName,
      name: job.name,
      data: JSON.stringify(job.data),
      status: job.status,
      priority: job.priority,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      backoff: JSON.stringify(job.backoff),
      timeout: job.timeout,
      dead_letter: job.deadLetter ? 1 : 0,
      result: job.result ? JSON.stringify(job.result) : null,
      error: job.error ?? null,
      stack_trace: job.stackTrace ?? null,
      delay: job.delay,
      process_after: job.processAfter,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
      started_at: job.startedAt ?? null,
      completed_at: job.completedAt ?? null,
      failed_at: job.failedAt ?? null,
      meta: JSON.stringify(job.meta),
    };
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      name: row.name as string,
      data: JSON.parse(row.data as string),
      status: row.status as JobStatus,
      priority: row.priority as number,
      attempts: row.attempts as number,
      maxAttempts: row.max_attempts as number,
      backoff: JSON.parse(row.backoff as string),
      timeout: row.timeout as number,
      deadLetter: (row.dead_letter as number) === 1,
      result: row.result ? JSON.parse(row.result as string) : undefined,
      error: (row.error as string) ?? undefined,
      stackTrace: (row.stack_trace as string) ?? undefined,
      delay: row.delay as number,
      processAfter: row.process_after as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      startedAt: (row.started_at as number) ?? undefined,
      completedAt: (row.completed_at as number) ?? undefined,
      failedAt: (row.failed_at as number) ?? undefined,
      meta: JSON.parse(row.meta as string),
    };
  }

  async addJob(queueName: string, job: Job): Promise<void> {
    const db = this.getDb();
    const row = this.jobToRow(queueName, job);
    const cols = Object.keys(row);
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT INTO jobs (${cols.join(", ")}) VALUES (${placeholders})`;
    db.prepare(sql).run(...Object.values(row));
  }

  async getJob(queueName: string, jobId: JobId): Promise<Job | null> {
    const db = this.getDb();
    const row = db.prepare("SELECT * FROM jobs WHERE queue = ? AND id = ?").get(queueName, jobId);
    return row ? this.rowToJob(row as Record<string, unknown>) : null;
  }

  async getNextJob(queueName: string): Promise<Job | null> {
    const db = this.getDb();
    const now = Date.now();
    const row = db
      .prepare(
        `SELECT * FROM jobs
         WHERE queue = ? AND status = ? AND process_after <= ?
         ORDER BY priority ASC, created_at ASC
         LIMIT 1`,
      )
      .get(queueName, Status.WAITING, now);

    return row ? this.rowToJob(row as Record<string, unknown>) : null;
  }

  async updateJob(queueName: string, jobId: JobId, updates: Partial<Job>): Promise<void> {
    const db = this.getDb();
    const fieldMap: Record<string, string> = {
      status: "status",
      attempts: "attempts",
      result: "result",
      error: "error",
      stackTrace: "stack_trace",
      processAfter: "process_after",
      updatedAt: "updated_at",
      startedAt: "started_at",
      completedAt: "completed_at",
      failedAt: "failed_at",
    };

    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      const col = fieldMap[key];
      if (!col) continue;

      sets.push(`${col} = ?`);
      if (key === "result" && value != null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value ?? null);
      }
    }

    if (sets.length === 0) return;

    values.push(queueName, jobId);
    db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE queue = ? AND id = ?`).run(...values);
  }

  async removeJob(queueName: string, jobId: JobId): Promise<void> {
    const db = this.getDb();
    db.prepare("DELETE FROM jobs WHERE queue = ? AND id = ?").run(queueName, jobId);
  }

  async getJobsByStatus(queueName: string, status: JobStatus, limit = 100): Promise<Job[]> {
    const db = this.getDb();
    const rows = db
      .prepare("SELECT * FROM jobs WHERE queue = ? AND status = ? ORDER BY priority ASC LIMIT ?")
      .all(queueName, status, limit);

    return (rows as Record<string, unknown>[]).map((r) => this.rowToJob(r));
  }

  async getJobCounts(queueName: string): Promise<Record<JobStatus, number>> {
    const db = this.getDb();
    const rows = db
      .prepare("SELECT status, COUNT(*) as count FROM jobs WHERE queue = ? GROUP BY status")
      .all(queueName) as Array<{ status: string; count: number }>;

    const counts: Record<string, number> = {
      [Status.WAITING]: 0,
      [Status.ACTIVE]: 0,
      [Status.COMPLETED]: 0,
      [Status.FAILED]: 0,
      [Status.DELAYED]: 0,
      [Status.DEAD]: 0,
    };

    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts as Record<JobStatus, number>;
  }

  async getReadyDelayedJobs(queueName: string): Promise<Job[]> {
    const db = this.getDb();
    const now = Date.now();
    const rows = db
      .prepare("SELECT * FROM jobs WHERE queue = ? AND status = ? AND process_after <= ?")
      .all(queueName, Status.DELAYED, now);

    return (rows as Record<string, unknown>[]).map((r) => this.rowToJob(r));
  }

  async clean(queueName: string, olderThan: number, status?: JobStatus): Promise<number> {
    const db = this.getDb();
    const cutoff = Date.now() - olderThan;

    if (status) {
      const result = db
        .prepare("DELETE FROM jobs WHERE queue = ? AND status = ? AND updated_at < ?")
        .run(queueName, status, cutoff);
      return result.changes;
    }

    const result = db
      .prepare(
        "DELETE FROM jobs WHERE queue = ? AND status IN (?, ?, ?) AND updated_at < ?",
      )
      .run(queueName, Status.COMPLETED, Status.FAILED, Status.DEAD, cutoff);
    return result.changes;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
