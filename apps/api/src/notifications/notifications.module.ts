import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  createMarketingQueue,
  createNotificationsQueue,
  createOrdersQueue,
  producerConnection,
} from '@nowoll/queues'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { LOW_STOCK_ALERTER } from '../inventory/low-stock-alerter.js'
import { ORDER_NOTIFIER } from '../orders/order-notifier.js'
import { CUSTOMER_NOTIFIER } from './customer-notifier.js'
import {
  MARKETING_QUEUE,
  MarketingQueueService,
  NOTIFICATIONS_QUEUE,
  NotificationsQueueService,
  ORDERS_QUEUE,
  OrdersQueueService,
} from './orders-queue.js'
import {
  QueuedCustomerNotifier,
  QueuedLowStockAlerter,
  QueuedMarketingEvents,
  QueuedOrderNotifier,
} from './queued-notifiers.js'

// @Global: orders, payments and inventory all report events through here.
// Tests replace ORDER_NOTIFIER, LOW_STOCK_ALERTER and CUSTOMER_NOTIFIER with recording fakes,
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
    {
      provide: NOTIFICATIONS_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        createNotificationsQueue(producerConnection(config.get('REDIS_URL', { infer: true }))),
    },
    {
      provide: MARKETING_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        createMarketingQueue(producerConnection(config.get('REDIS_URL', { infer: true }))),
    },
    OrdersQueueService,
    NotificationsQueueService,
    MarketingQueueService,
    QueuedMarketingEvents,
    { provide: ORDER_NOTIFIER, useClass: QueuedOrderNotifier },
    { provide: LOW_STOCK_ALERTER, useClass: QueuedLowStockAlerter },
    { provide: CUSTOMER_NOTIFIER, useClass: QueuedCustomerNotifier },
  ],
  exports: [
    ORDER_NOTIFIER,
    LOW_STOCK_ALERTER,
    CUSTOMER_NOTIFIER,
    OrdersQueueService,
    NotificationsQueueService,
  ],
})
export class NotificationsModule {}
