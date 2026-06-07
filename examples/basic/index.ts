/**
 * Basic QueueBolt Example
 *
 * Demonstrates: adding jobs, processing, events, job counts.
 *
 * Run: npx tsx examples/basic/index.ts
 */

import { Queue, JobStatus } from "../../src/index.js";

async function main() {
  // 1. Create a queue
  const queue = new Queue("basic-tasks", {
    concurrency: 2,
  });

  // 2. Listen for events
  queue.on("job:added", (job) => {
    console.log(`[+] Job added: ${job.name} (${job.id})`);
  });

  queue.on("job:completed", (job) => {
    console.log(`[✓] Job completed: ${job.name} → ${JSON.stringify(job.result)}`);
  });

  queue.on("job:failed", (job, error) => {
    console.log(`[✗] Job failed: ${job.name} → ${error.message}`);
  });

  queue.on("queue:drained", () => {
    console.log("[~] Queue drained — all jobs processed!");
  });

  // 3. Register a processor
  queue.process(async (job) => {
    console.log(`  Processing: ${job.name} with data:`, job.data);

    // Simulate work
    await new Promise((r) => setTimeout(r, 500));

    return { processed: true, name: job.name };
  });

  // 4. Add some jobs
  await queue.add("greet", { message: "Hello, World!" });
  await queue.add("compute", { x: 10, y: 20 }, { priority: -5 }); // higher priority
  await queue.add("notify", { channel: "slack" });

  // 5. Wait for processing, then show counts
  await new Promise((r) => setTimeout(r, 3000));

  const counts = await queue.getJobCounts();
  console.log("\nJob counts:", counts);

  await queue.close();
  console.log("Queue closed. Goodbye!");
}

main().catch(console.error);
