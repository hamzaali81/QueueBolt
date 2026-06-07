/**
 * Scheduled Jobs Example
 *
 * Demonstrates: delayed jobs, priority queues, job management.
 *
 * Run: npx tsx examples/scheduled-jobs/index.ts
 */

import { Queue, JobPriority, JobStatus } from "../../src/index.js";

async function main() {
  const queue = new Queue("scheduler", {
    concurrency: 1,
    pollInterval: 500,
  });

  queue.on("job:active", (job) => {
    console.log(`  ▶ Processing: ${job.name} (priority: ${job.priority})`);
  });

  queue.on("job:completed", (job) => {
    console.log(`  ✓ Done: ${job.name}`);
  });

  queue.process(async (job) => {
    await new Promise((r) => setTimeout(r, 200));
    return { executed: job.name, at: new Date().toISOString() };
  });

  console.log("Adding jobs with different priorities and delays...\n");

  // Priority: CRITICAL jobs run first
  await queue.add("low-priority-report", {}, { priority: JobPriority.LOW });
  await queue.add("critical-alert", {}, { priority: JobPriority.CRITICAL });
  await queue.add("normal-task", {}, { priority: JobPriority.NORMAL });
  await queue.add("high-priority-sync", {}, { priority: JobPriority.HIGH });

  // Delayed job — runs after 2 seconds
  await queue.add("delayed-cleanup", {}, { delay: 2000 });

  console.log("Processing in priority order...\n");

  // Wait for all
  await new Promise((r) => setTimeout(r, 5000));

  const counts = await queue.getJobCounts();
  console.log("\nFinal counts:", counts);

  // Show completed jobs
  const completed = await queue.getJobs(JobStatus.COMPLETED);
  console.log(
    "Completed order:",
    completed.map((j) => j.name),
  );

  await queue.close();
}

main().catch(console.error);
