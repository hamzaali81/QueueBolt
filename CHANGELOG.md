# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-06

### Added

- Core `Queue` class with type-safe generics
- `MemoryBackend` — in-memory storage for development and testing
- `RedisBackend` — production-grade Redis storage via ioredis
- `SQLiteBackend` — persistent file-based storage via better-sqlite3
- Job priority system (CRITICAL, HIGH, NORMAL, LOW)
- Retry logic with fixed and exponential backoff (with jitter)
- Dead-letter queue for permanently failed jobs
- Job timeouts with configurable duration
- Concurrency control per queue
- Delayed/scheduled job execution
- Bulk job addition via `addBulk()`
- Job lifecycle events (added, active, completed, failed, retrying, dead, drained)
- `pause()` / `resume()` for flow control
- `clean()` for removing old completed/failed jobs
- `retryJob()` for re-queuing dead/failed jobs
- Duplicate job prevention via custom job IDs
- Graceful shutdown with active job drain
- Full TypeScript support with strict types
- Comprehensive test suite (unit tests for core, backends, utilities)
- Three example projects (basic, email-queue, scheduled-jobs)
- CI/CD via GitHub Actions
- Complete documentation (README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT)
