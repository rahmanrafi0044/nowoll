import { Redis, type RedisOptions } from 'ioredis'
import { type JobsOptions, Queue } from 'bullmq'

// ============================================================================
// The CONTRACT between the API (adds jobs) and the workers (run them) —
// CLAUDE.md §10. Both import these names and shapes, so they can never
// disagree about what a job contains.
//
// Jobs carry IDs, not copies: the worker reads the order FRESH from the
// database, so an email always shows the order as it really is.
// ============================================================================

export const ORDERS_QUEUE = 'orders'

/** Low-stock details (computed by the API at the moment stock changes). */
export interface LowStockAlertData {
  variantId: string
  sku: string
  productName: string
  variantLabel: string
  stock: number
  threshold: number
}

/** Every job the orders queue carries, by job name. */
export interface OrderJobs {
  /** Cash-on-delivery order placed → confirmation email with receipt. */
  'order-confirmation': { orderId: string }
  /** Online payment confirmed by SSLCommerz → "Payment received ✓" with receipt. */
  'payment-confirmed': { orderId: string }
  /** Stock fell to its threshold → email the admin. */
  'low-stock-alert': { alerts: LowStockAlertData[] }
}
export type OrderJobName = keyof OrderJobs

/**
 * Fixed job IDs make "never twice" hold: BullMQ ignores a job whose ID it
 * already has. (BullMQ IDs can't contain ":" — hence "_".)
 */
export const orderJobId = (name: 'order-confirmation' | 'payment-confirmed', orderNumber: number) =>
  `${name}_NW-${orderNumber}`

/**
 * Retry rules for every job: 5 tries, waiting 30 s, 1, 2, 4, 8 min (doubling).
 * Finished jobs are kept 7 days — long enough that a repeat of the same job ID
 * is still recognised and ignored — then removed, so Redis doesn't grow forever.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
  removeOnFail: { age: 30 * 24 * 3600 },
}

/**
 * Redis connection for the side that ADDS jobs (the API). Fails fast while
 * Redis is down (BullMQ "going to production": enableOfflineQueue: false) —
 * a customer's checkout must never hang waiting for Redis. lazyConnect: no
 * connection until the first job (tests that never queue never connect).
 */
export function producerConnection(redisUrl: string, extra: RedisOptions = {}): Redis {
  return new Redis(redisUrl, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    ...extra,
  })
}

/** Redis connection for WORKERS: BullMQ requires maxRetriesPerRequest: null there. */
export function workerConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null })
}

/** The orders queue, typed: add('order-confirmation', { orderId }) only accepts the right data. */
export type OrdersQueue = Queue<OrderJobs[OrderJobName], unknown, OrderJobName>

export function createOrdersQueue(connection: Redis, prefix?: string): OrdersQueue {
  return new Queue(ORDERS_QUEUE, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
    ...(prefix && { prefix }),
  })
}
export type { JobsOptions } from 'bullmq'
