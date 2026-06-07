<p align="center">
  <img src="https://img.shields.io/badge/⚡-QueueBolt-blue?style=for-the-badge&labelColor=000" alt="QueueBolt" />
</p>

<h3 align="center">A lightweight, reliable background job queue for Node.js</h3>

<p align="center">
  <a href="https://github.com/hamzaali81/queuebolt/actions/workflows/ci.yml"><img src="https://github.com/hamzaali81/queuebolt/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/queuebolt"><img src="https://img.shields.io/npm/v/queuebolt.svg" alt="npm" /></a>
  <a href="https://github.com/hamzaali81/queuebolt/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://www.npmjs.com/package/queuebolt"><img src="https://img.shields.io/npm/dm/queuebolt.svg" alt="Downloads" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-green.svg" alt="Node" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" />
</p>

---

**QueueBolt** is a simple, production-ready background job queue for Node.js. It handles retries with exponential backoff, job priorities, delayed execution, dead-letter queues, and pluggable storage backends — without the complexity of heavy message brokers.

## Why QueueBolt?

Most job queues are either too simple (no retries, no persistence) or too complex (require dedicated infrastructure, steep learning curve). QueueBolt sits in the sweet spot:

| Feature | QueueBolt | Bull/BullMQ | Agenda | bee-queue |
| --- | :---: | :---: | :---: | :---: |
| Zero infrastructure needed | ✅ | ❌ (Redis required) | ❌ (MongoDB required) | ❌ (Redis required) |
| Multiple backends | ✅ Memory, Redis, SQLite | Redis only | MongoDB only | Redis only |
| TypeScript-first | ✅ | ✅ | ❌ | ❌ |
| Dead-letter queue | ✅ | ✅ | ❌ | ❌ |
| Bundle size | Tiny | Large | Medium | Medium |
| Learning curve | Minimal | Steep | Moderate | Minimal |

## Features

- **Pluggable backends** — Memory (dev), Redis (distributed), SQLite (persistent single-server)
- **Retry with backoff** — Fixed or exponential with jitter, configurable per job
- **Dead-letter queue** — Failed jobs are preserved for inspection and manual retry
- **Job priorities** — CRITICAL, HIGH, NORMAL, LOW — processed in order
- **Delayed jobs** — Schedule jobs to run after a specified delay
- **Concurrency control** — Limit parallel workers per queue
- **Job timeouts** — Auto-fail jobs that take too long
- **Type-safe** — Full TypeScript generics for job data and results
- **Event-driven** — Listen to job lifecycle events (added, active, completed, failed, dead, drained)
- **Graceful shutdown** — Drains active jobs before closing
- **Duplicate prevention** — Custom job IDs prevent duplicate processing
- **Bulk operations** — Add multiple jobs in one call

## Quick Start

### Install

```bash
npm install queuebolt
```

### Basic Usage

```ts
import { Queue } from "queuebolt";

// Create a queue
const queue = new Queue("emails");

// Register a processor
queue.process(async (job) => {
  console.log(`Sending email to ${job.data.to}`);
  await sendEmail(job.data.to, job.data.subject);
  return { sent: true };
});

// Add a job
await queue.add("welcome-email", {
  to: "user@example.com",
  subject: "Welcome!",
});
```

### With Retries and Priority

```ts
await queue.add("critical-notification", {
  to: "admin@example.com",
  subject: "Server Alert",
}, {
  priority: -10,           // CRITICAL — processed first
  attempts: 5,             // Retry up to 5 times
  backoff: {
    type: "exponential",
    delay: 1000,            // 1s, 2s, 4s, 8s, 16s
    maxDelay: 30000,        // Cap at 30s
  },
  timeout: 10000,           // Fail if takes > 10s
  deadLetter: true,         // Move to DLQ after all retries
});
```

### With Redis (Production)

```ts
import { Queue } from "queuebolt";
import { RedisBackend } from "queuebolt/backends/redis";

const queue = new Queue("tasks", {
  backend: new RedisBackend({ host: "localhost", port: 6379 }),
  concurrency: 5,
});
```

### With SQLite (Persistent, No Infrastructure)

```ts
import { Queue } from "queuebolt";
import { SQLiteBackend } from "queuebolt/backends/sqlite";

const queue = new Queue("tasks", {
  backend: new SQLiteBackend("./data/queue.db"),
});
```

### Events

```ts
queue.on("job:completed", (job) => {
  console.log(`✓ ${job.name} completed:`, job.result);
});

queue.on("job:failed", (job, error) => {
  console.log(`✗ ${job.name} failed:`, error.message);
});

queue.on("job:retrying", (job, attempt) => {
  console.log(`↻ ${job.name} retrying (${attempt}/${job.maxAttempts})`);
});

queue.on("job:dead", (job) => {
  console.log(`☠ ${job.name} moved to dead-letter queue`);
});

queue.on("queue:drained", () => {
  console.log("All jobs processed!");
});
```

## API Reference

### `new Queue(name, options?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `backend` | `StorageAdapter` | `MemoryBackend` | Storage backend |
| `defaultJobOptions` | `Partial<JobOptions>` | `{}` | Default options for all jobs |
| `concurrency` | `number` | `1` | Max parallel workers |
| `pollInterval` | `number` | `1000` | Polling interval (ms) for delayed jobs |

### `queue.add(name, data, options?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `priority` | `number` | `0` | Lower = higher priority |
| `delay` | `number` | `0` | Delay in ms before processing |
| `attempts` | `number` | `3` | Max retry attempts |
| `backoff` | `BackoffOptions` | `{ type: "exponential", delay: 1000 }` | Retry strategy |
| `timeout` | `number` | `30000` | Job timeout in ms |
| `deadLetter` | `boolean` | `true` | Move to DLQ after all retries |
| `jobId` | `string` | auto-generated | Custom job ID (prevents duplicates) |
| `meta` | `Record<string, unknown>` | `{}` | Arbitrary metadata |

### Queue Methods

| Method | Description |
| --- | --- |
| `process(fn)` | Register a processor function |
| `add(name, data, options?)` | Add a single job |
| `addBulk(jobs)` | Add multiple jobs |
| `getJob(id)` | Get a job by ID |
| `getJobs(status, limit?)` | Get jobs by status |
| `getJobCounts()` | Get counts per status |
| `removeJob(id)` | Remove a job |
| `retryJob(id)` | Re-queue a failed/dead job |
| `clean(olderThan, status?)` | Remove old jobs |
| `pause()` | Stop picking new jobs |
| `resume()` | Resume processing |
| `close()` | Graceful shutdown |

### Job Statuses

| Status | Description |
| --- | --- |
| `waiting` | Ready to be processed |
| `active` | Currently being processed |
| `completed` | Successfully finished |
| `failed` | Failed (no more retries, no DLQ) |
| `delayed` | Waiting for delay/backoff to expire |
| `dead` | In dead-letter queue (all retries exhausted) |

### Storage Backends

| Backend | Install | Best For |
| --- | --- | --- |
| `MemoryBackend` | Built-in | Development, testing |
| `RedisBackend` | `npm i ioredis` | Production, distributed workers |
| `SQLiteBackend` | `npm i better-sqlite3` | Single-server, persistent |

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Queue                          │
│                                                  │
│  ┌─────────┐   ┌──────────┐   ┌──────────────┐  │
│  │ add()   │──▶│ WAITING  │──▶│  Processor   │  │
│  └─────────┘   └──────────┘   └──────┬───────┘  │
│                                      │           │
│                     ┌────────────────┼────────┐  │
│                     │                │        │  │
│               ┌─────▼─────┐   ┌─────▼─────┐  │  │
│               │ COMPLETED │   │  FAILED    │  │  │
│               └───────────┘   └─────┬─────┘  │  │
│                                     │        │  │
│                              ┌──────▼──────┐ │  │
│                              │   DELAYED   │─┘  │
│                              │  (backoff)  │    │
│                              └──────┬──────┘    │
│                                     │           │
│                              ┌──────▼──────┐    │
│                              │    DEAD     │    │
│                              │ (DLQ)       │    │
│                              └─────────────┘    │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │         StorageAdapter                   │    │
│  │  Memory │ Redis │ SQLite │ Custom        │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

## Project Structure

```
queuebolt/
├── src/
│   ├── core/
│   │   └── queue.ts           # Main Queue class
│   ├── backends/
│   │   ├── memory.ts          # In-memory backend
│   │   ├── redis.ts           # Redis backend (ioredis)
│   │   └── sqlite.ts          # SQLite backend (better-sqlite3)
│   ├── types/
│   │   └── index.ts           # All TypeScript types
│   ├── utils/
│   │   ├── backoff.ts         # Backoff calculation
│   │   ├── errors.ts          # Custom error classes
│   │   └── id.ts              # ID generation
│   └── index.ts               # Public API exports
├── tests/
│   └── unit/                  # Unit tests
├── examples/
│   ├── basic/                 # Basic usage
│   ├── email-queue/           # Retry & DLQ demo
│   └── scheduled-jobs/        # Priority & delay demo
├── .github/
│   ├── workflows/             # CI/CD
│   └── ISSUE_TEMPLATE/        # Bug & feature templates
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── CONTRIBUTING.md
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

## Writing a Custom Backend

Implement the `StorageAdapter` interface:

```ts
import type { StorageAdapter, Job, JobId, JobStatus } from "queuebolt";

export class MyCustomBackend implements StorageAdapter {
  async init() { /* connect */ }
  async addJob(queue: string, job: Job) { /* store */ }
  async getJob(queue: string, id: JobId) { /* fetch */ }
  async getNextJob(queue: string) { /* priority-sorted fetch */ }
  async updateJob(queue: string, id: JobId, updates: Partial<Job>) { /* update */ }
  async removeJob(queue: string, id: JobId) { /* delete */ }
  async getJobsByStatus(queue: string, status: JobStatus, limit?: number) { /* filter */ }
  async getJobCounts(queue: string) { /* aggregate */ }
  async getReadyDelayedJobs(queue: string) { /* time-based query */ }
  async clean(queue: string, olderThan: number, status?: JobStatus) { /* purge */ }
  async close() { /* disconnect */ }
}
```

## Roadmap

- [ ] Repeatable/cron jobs with built-in scheduler
- [ ] Dashboard UI for monitoring queues
- [ ] Rate limiting per queue
- [ ] Job dependencies (job B waits for job A)
- [ ] PostgreSQL backend
- [ ] Worker threads support
- [ ] Metrics and Prometheus integration
- [ ] CLI tool for queue inspection

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

## License

[MIT](LICENSE) — Hamza Ali
