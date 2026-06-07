---
name: Bug Report
about: Report a bug to help us improve QueueBolt
title: "[BUG] "
labels: bug
assignees: ""
---

## Describe the Bug

A clear and concise description of what the bug is.

## To Reproduce

Steps to reproduce the behavior:

1. Create a queue with '...'
2. Add a job with '...'
3. See error

## Minimal Reproduction Code

```ts
import { Queue } from "queuebolt";

const queue = new Queue("test");
// ... minimal code to reproduce
```

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened. Include error messages and stack traces if applicable.

## Environment

- **QueueBolt version:** x.x.x
- **Node.js version:** x.x.x
- **OS:** macOS / Linux / Windows
- **Storage backend:** Memory / Redis / SQLite

## Additional Context

Add any other context about the problem here.
