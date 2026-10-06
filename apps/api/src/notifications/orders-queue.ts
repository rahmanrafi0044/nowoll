import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import type { JobsOptions, OrderJobName, OrderJobs, OrdersQueue } from '@nowoll/queues'

export const ORDERS_QUEUE = Symbol('ORDERS_QUEUE')

/**
 * Adds jobs to the orders queue. Never throws: by the time a job is added the
 * order is already saved, so a Redis problem must not turn a successful order
 * into an error for the customer. Instead it tries 3 times, then logs a loud
 * ALERT (the email for that order is then not sent — see docs/workers.md).
 */
@Injectable()
export class OrdersQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger('OrdersQueue')

  constructor(@Inject(ORDERS_QUEUE) private readonly queue: OrdersQueue) {}

  async add<N extends OrderJobName>(
    name: N,
    data: OrderJobs[N],
    opts: JobsOptions = {},
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.queue.add(name, data, opts)
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
