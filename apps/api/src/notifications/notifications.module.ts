import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createOrdersQueue, producerConnection } from '@nowoll/queues'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { LOW_STOCK_ALERTER } from '../inventory/low-stock-alerter.js'
import { ORDER_NOTIFIER } from '../orders/order-notifier.js'
import { ORDERS_QUEUE, OrdersQueueService } from './orders-queue.js'
import { QueuedLowStockAlerter, QueuedOrderNotifier } from './queued-notifiers.js'

// @Global: orders, payments and inventory all report events through here.
// Tests replace ORDER_NOTIFIER and LOW_STOCK_ALERTER with recording fakes,
// so they never need Redis (the queue only connects when a job is added).
@Global()
@Module({
  providers: [
    {
      provide: ORDERS_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        createOrdersQueue(producerConnection(config.get('REDIS_URL', { infer: true }))),
    },
    OrdersQueueService,
    { provide: ORDER_NOTIFIER, useClass: QueuedOrderNotifier },
    { provide: LOW_STOCK_ALERTER, useClass: QueuedLowStockAlerter },
  ],
  exports: [ORDER_NOTIFIER, LOW_STOCK_ALERTER, OrdersQueueService],
})
export class NotificationsModule {}
