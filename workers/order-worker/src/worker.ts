import { ORDERS_QUEUE, type OrderJobName, type OrderJobs } from '@nowoll/queues'
import { Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import { type Deps, handleOrderJob } from './handle-job.js'

/** The BullMQ worker for the orders queue. `prefix` lets tests use their own corner of Redis. */
export function createOrderWorker(
  deps: Deps,
  connection: Redis,
  opts: { prefix?: string; concurrency?: number } = {},
) {
  const worker = new Worker<OrderJobs[OrderJobName], string, OrderJobName>(
    ORDERS_QUEUE,
    (job) => handleOrderJob(job, deps),
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

const log = (line: string) => console.log(`${new Date().toISOString()} [order-worker] ${line}`)
