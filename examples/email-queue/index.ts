/**
 * Email Queue Example
 *
 * Demonstrates: retries, backoff, dead-letter queue, error handling.
 * Simulates sending emails with occasional failures.
 *
 * Run: npx tsx examples/email-queue/index.ts
 */

import { Queue, JobStatus } from "../../src/index.js";

interface EmailData {
  to: string;
  subject: string;
  body: string;
  [key: string]: unknown;
}

// Simulate an unreliable email service
let sendCount = 0;
async function sendEmail(to: string, subject: string, _body: string): Promise<boolean> {
  sendCount++;
  // Fail the first 2 attempts to demonstrate retries
  if (sendCount <= 2) {
    throw new Error(`SMTP connection refused (attempt ${sendCount})`);
  }
  console.log(`    📧 Email sent to ${to}: "${subject}"`);
  return true;
}

async function main() {
  const emailQueue = new Queue<EmailData>("emails", {
    concurrency: 3,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 500, maxDelay: 5000 },
      timeout: 10000,
      deadLetter: true,
    },
  });

  // Event listeners
  emailQueue.on("job:retrying", (job, attempt) => {
    console.log(`  ↻ Retrying "${job.data.subject}" (attempt ${attempt}/${job.maxAttempts})`);
  });

  emailQueue.on("job:completed", (job) => {
    console.log(`  ✓ Delivered: "${job.data.subject}" → ${job.data.to}`);
  });

  emailQueue.on("job:dead", (job) => {
    console.log(`  ☠ Dead-letter: "${job.data.subject}" — ${job.error}`);
  });

  // Processor
  emailQueue.process(async (job) => {
    await sendEmail(job.data.to, job.data.subject, job.data.body);
    return { delivered: true };
  });

  // Enqueue emails
  console.log("Queueing emails...\n");

  await emailQueue.add("welcome", {
    to: "alice@example.com",
    subject: "Welcome to QueueBolt!",
    body: "Thanks for signing up.",
  });

  await emailQueue.add("invoice", {
    to: "bob@example.com",
    subject: "Invoice #1042",
    body: "Your invoice is attached.",
  });

  // Wait for processing
  await new Promise((r) => setTimeout(r, 8000));

  // Show final state
  const counts = await emailQueue.getJobCounts();
  console.log("\nFinal job counts:", counts);

  const deadJobs = await emailQueue.getJobs(JobStatus.DEAD);
  if (deadJobs.length > 0) {
    console.log(
      "Dead-letter jobs:",
      deadJobs.map((j) => ({ id: j.id, name: j.name, error: j.error })),
    );
  }

  await emailQueue.close();
}

main().catch(console.error);
