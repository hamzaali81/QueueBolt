/**
 * Core type definitions for QueueBolt.
 */

// ─── Job Types ───────────────────────────────────────────────

export type JobId = string;

export enum JobStatus {
  WAITING = "waiting",
  ACTIVE = "active",
  COMPLETED = "completed",
  FAILED = "failed",
  DELAYED = "delayed",
  DEAD = "dead", // moved to dead-letter queue
}

export enum JobPriority {
  LOW = 10,
  NORMAL = 0,
  HIGH = -5,
  CRITICAL = -10,
}

export interface JobData {
  [key: string]: unknown;
}

export interface JobResult {
  [key: string]: unknown;
}

export interface JobOptions {
  /** Job priority — lower number = higher priority. Default: 0 */
  priority?: number;
  /** Delay in ms before the job becomes processable. */
  delay?: number;
  /** Maximum number of retry attempts. Default: 3 */
  attempts?: number;
  /** Backoff strategy for retries. */
  backoff?: BackoffOptions;
  /** Timeout in ms — job fails if it exceeds this. Default: 30000 */
  timeout?: number;
  /** Move to dead-letter queue after all retries exhausted. Default: true */
  deadLetter?: boolean;
  /** Unique job ID — prevents duplicate jobs with the same ID. */
  jobId?: string;
  /** Arbitrary metadata attached to the job. */
  meta?: Record<string, unknown>;
}

export interface BackoffOptions {
  type: "fixed" | "exponential";
  /** Base delay in ms. Default: 1000 */
  delay: number;
  /** Maximum delay in ms (for exponential). Default: 30000 */
  maxDelay?: number;
}

export interface Job<TData extends JobData = JobData, TResult extends JobResult = JobResult> {
  id: JobId;
  name: string;
  data: TData;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  backoff: BackoffOptions;
  timeout: number;
  deadLetter: boolean;
  result?: TResult;
  error?: string;
  stackTrace?: string;
  delay: number;
  processAfter: number; // timestamp
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  meta: Record<string, unknown>;
}

// ─── Queue Types ─────────────────────────────────────────────

export interface QueueOptions {
  /** Storage backend. Default: MemoryBackend */
  backend?: StorageAdapter;
  /** Default job options applied to every job in this queue. */
  defaultJobOptions?: Partial<JobOptions>;
  /** Maximum concurrent workers. Default: 1 */
  concurrency?: number;
  /** Poll interval in ms for checking delayed/waiting jobs. Default: 1000 */
  pollInterval?: number;
}

export type ProcessorFn<TData extends JobData = JobData, TResult extends JobResult = JobResult> = (
  job: Job<TData, TResult>,
) => Promise<TResult>;

// ─── Queue Events ────────────────────────────────────────────

export type QueueEvent =
  | "job:added"
  | "job:active"
  | "job:completed"
  | "job:failed"
  | "job:retrying"
  | "job:dead"
  | "job:progress"
  | "queue:error"
  | "queue:drained"; // all jobs processed

export interface QueueEventMap {
  "job:added": (job: Job) => void;
  "job:active": (job: Job) => void;
  "job:completed": (job: Job) => void;
  "job:failed": (job: Job, error: Error) => void;
  "job:retrying": (job: Job, attempt: number) => void;
  "job:dead": (job: Job) => void;
  "job:progress": (job: Job, progress: number) => void;
  "queue:error": (error: Error) => void;
  "queue:drained": () => void;
}

// ─── Storage Adapter ─────────────────────────────────────────

export interface StorageAdapter {
  /** Initialize the backend (create tables, connect, etc.) */
  init(): Promise<void>;

  /** Store a new job. */
  addJob(queueName: string, job: Job): Promise<void>;

  /** Get a job by ID. */
  getJob(queueName: string, jobId: JobId): Promise<Job | null>;

  /** Get the next waiting job (respecting priority and processAfter). */
  getNextJob(queueName: string): Promise<Job | null>;

  /** Update a job's fields. */
  updateJob(queueName: string, jobId: JobId, updates: Partial<Job>): Promise<void>;

  /** Remove a job. */
  removeJob(queueName: string, jobId: JobId): Promise<void>;

  /** Get all jobs with a given status. */
  getJobsByStatus(queueName: string, status: JobStatus, limit?: number): Promise<Job[]>;

  /** Count jobs by status. */
  getJobCounts(
    queueName: string,
  ): Promise<Record<JobStatus, number>>;

  /** Get delayed jobs that are now ready (processAfter <= now). */
  getReadyDelayedJobs(queueName: string): Promise<Job[]>;

  /** Clean up completed/failed jobs older than the given age (ms). */
  clean(queueName: string, olderThan: number, status?: JobStatus): Promise<number>;

  /** Shut down the backend gracefully. */
  close(): Promise<void>;
}

// ─── Scheduler Types ─────────────────────────────────────────

export interface ScheduleOptions {
  /** Cron expression (e.g. "0/5 * * * *" for every 5 minutes). */
  cron: string;
  /** Job data to enqueue on each tick. */
  data?: JobData;
  /** Job options for each scheduled job. */
  jobOptions?: Partial<JobOptions>;
  /** Timezone for the cron schedule. Default: UTC */
  timezone?: string;
}
