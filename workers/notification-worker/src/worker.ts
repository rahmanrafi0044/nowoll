import {
  MARKETING_QUEUE,
  type MarketingJobName,
  type MarketingJobs,
  NOTIFICATIONS_QUEUE,
  type NotificationJobName,
  type NotificationJobs,
} from '@nowoll/queues'
import { Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import { type Deps, handleNotificationJob } from './handle-job.js'
import { handleMarketingJob, type MarketingDeps } from './marketing-job.js'

/** The BullMQ worker for the notifications queue. */
export function createNotificationWorker(
  deps: Deps,
  connection: Redis,
  opts: { prefix?: string; concurrency?: number } = {},
) {
  const worker = new Worker<NotificationJobs[NotificationJobName], string, NotificationJobName>(
    NOTIFICATIONS_QUEUE,
    (job) => handleNotificationJob(job, deps),
    { connection, concurrency: opts.concurrency ?? 5, ...(opts.prefix && { prefix: opts.prefix }) },
  )
  worker.on('completed', (job, note) => log(`✓ ${job.name} ${job.id}: ${note}`))
  worker.on('failed', (job, error) => {
    const left = job ? (job.opts.attempts ?? 1) - job.attemptsMade : 0
    // TODO(phase 7): report final failures to Sentry.
    log(
      `✗ ${job?.name} ${job?.id}: ${error.message}${left > 0 ? ` — will retry (${left} left)` : ' — GAVE UP'}`,
    )
  })
  worker.on('error', (error) => log(`worker error: ${error.message}`))
  return worker
}

const log = (line: string) =>
  console.log(`${new Date().toISOString()} [notification-worker] ${line}`)

/**
 * The BullMQ worker for the marketing queue (step 39b) — in this same
 * process, but its own worker, so a slow Meta never holds up an email.
 */
export function createMarketingWorker(
  deps: MarketingDeps,
  connection: Redis,
  opts: { prefix?: string; concurrency?: number } = {},
) {
  const worker = new Worker<MarketingJobs[MarketingJobName], string, MarketingJobName>(
    MARKETING_QUEUE,
    (job) => handleMarketingJob(job, deps),
    { connection, concurrency: opts.concurrency ?? 2, ...(opts.prefix && { prefix: opts.prefix }) },
  )
  worker.on('completed', (job, note) => log(`✓ ${job.name} ${job.id}: ${note}`))
  worker.on('failed', (job, error) => log(`✗ ${job?.name} ${job?.id}: ${error.message}`))
  worker.on('error', (error) => log(`marketing worker error: ${error.message}`))
  return worker
}
