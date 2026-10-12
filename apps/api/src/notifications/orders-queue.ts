import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import type {
  JobsOptions,
  MarketingJobName,
  MarketingJobs,
  MarketingQueue,
  NotificationJobName,
  NotificationJobs,
  NotificationsQueue,
  OrderJobName,
  OrderJobs,
  OrdersQueue,
} from '@nowoll/queues'

export const ORDERS_QUEUE = Symbol('ORDERS_QUEUE')
export const NOTIFICATIONS_QUEUE = Symbol('NOTIFICATIONS_QUEUE')
export const MARKETING_QUEUE = Symbol('MARKETING_QUEUE')

type AnyQueue = OrdersQueue | NotificationsQueue | MarketingQueue

/**
 * Adds jobs to a queue. Never throws: by the time a job is added, the thing it
 * reports (an order, a sign-up, a refund) is already saved — a Redis problem
 * must not turn that success into an error. It tries 3 times, then logs a loud
 * ALERT (that email is then not sent — see docs/workers.md).
 */
abstract class SafeQueue<Jobs, Name extends keyof Jobs & string> implements OnApplicationShutdown {
  protected abstract readonly logger: Logger

  constructor(private readonly queue: AnyQueue) {}

  async add<N extends Name>(name: N, data: Jobs[N], opts: JobsOptions = {}): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await (
          this.queue as unknown as {
            add: (n: string, d: unknown, o: JobsOptions) => Promise<unknown>
          }
        ).add(name, data, opts)
        return true
      } catch (error) {
        if (attempt === 3) {
          this.logger.error(
            `ALERT could not queue ${name} (${opts.jobId ?? 'no id'}): ${String(error)}`,
          )
          return false
        }
        await new Promise((r) => setTimeout(r, attempt * 200))
      }
    }
    return false
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close().catch(() => {})
    await (this.queue.opts.connection as { quit?: () => Promise<unknown> }).quit?.().catch(() => {})
  }
}

@Injectable()
export class OrdersQueueService extends SafeQueue<OrderJobs, OrderJobName> {
  protected readonly logger = new Logger('OrdersQueue')
  constructor(@Inject(ORDERS_QUEUE) queue: OrdersQueue) {
    super(queue)
  }
}

@Injectable()
export class NotificationsQueueService extends SafeQueue<NotificationJobs, NotificationJobName> {
  protected readonly logger = new Logger('NotificationsQueue')
  constructor(@Inject(NOTIFICATIONS_QUEUE) queue: NotificationsQueue) {
    super(queue)
  }
}

/** Meta Conversions API events (step 39b). */
@Injectable()
export class MarketingQueueService extends SafeQueue<MarketingJobs, MarketingJobName> {
  protected readonly logger = new Logger('MarketingQueue')
  constructor(@Inject(MARKETING_QUEUE) queue: MarketingQueue) {
    super(queue)
  }
}
