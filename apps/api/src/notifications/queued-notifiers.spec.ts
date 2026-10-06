// The API side of the order worker (step 27): which events become which jobs.
// Real Redis (docker compose up -d redis; CI runs it), a unique queue prefix
// per run so a running dev worker never picks these test jobs up.
import { randomUUID } from 'node:crypto'
import { createNotificationsQueue, createOrdersQueue, producerConnection } from '@nowoll/queues'
import { NotificationsQueueService, OrdersQueueService } from './orders-queue.js'
import {
  QueuedCustomerNotifier,
  QueuedLowStockAlerter,
  QueuedOrderNotifier,
} from './queued-notifiers.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const connection = producerConnection(REDIS_URL)
const queue = createOrdersQueue(connection, `test-${randomUUID()}`)
const service = new OrdersQueueService(queue)
const notifier = new QueuedOrderNotifier(service)

afterEach(() => queue.obliterate({ force: true }))
afterAll(async () => {
  await queue.close()
  await connection.quit()
})

const placed = (paymentMethod: 'COD' | 'SSLCOMMERZ', orderNumber = 10001) => ({
  orderId: randomUUID(),
  orderNumber,
  email: 'rafi@example.com',
  paymentMethod,
  total: '1550',
})
const jobs = async () =>
  (await queue.getJobs(['waiting'])).map((j) => ({ name: j.name, id: j.id, data: j.data }))

describe('order events → jobs', () => {
  it('cash on delivery placed → ONE confirmation job (even if reported twice)', async () => {
    const e = placed('COD')
    await notifier.orderPlaced(e)
    await notifier.orderPlaced(e)
    expect(await jobs()).toEqual([
      {
        name: 'order-confirmation',
        id: 'order-confirmation_NW-10001',
        data: { orderId: e.orderId },
      },
    ])
  })

  it('online order placed → nothing yet (it may never be paid)', async () => {
    await notifier.orderPlaced(placed('SSLCOMMERZ'))
    expect(await jobs()).toEqual([])
  })

  it('online payment confirmed → ONE "payment received" job', async () => {
    const orderId = randomUUID()
    await notifier.paymentConfirmed({ orderId, orderNumber: 10002 })
    await notifier.paymentConfirmed({ orderId, orderNumber: 10002 })
    expect(await jobs()).toEqual([
      { name: 'payment-confirmed', id: 'payment-confirmed_NW-10002', data: { orderId } },
    ])
  })

  it('low stock → a job with the details; nothing for an empty list', async () => {
    const alerter = new QueuedLowStockAlerter(service)
    await alerter.notify([])
    expect(await jobs()).toEqual([])
    const alert = {
      variantId: 'v1',
      sku: 'S1',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      stock: 2,
      threshold: 5,
    }
    await alerter.notify([alert])
    expect(await jobs()).toEqual([
      expect.objectContaining({ name: 'low-stock-alert', data: { alerts: [alert] } }),
    ])
  })
})

describe('Redis down', () => {
  it('never throws (the order is already saved) — reports false after 3 tries, quickly', async () => {
    const dead = producerConnection('redis://localhost:1', { connectTimeout: 300 })
    const broken = new OrdersQueueService(createOrdersQueue(dead, `test-${randomUUID()}`))
    const started = Date.now()
    await expect(broken.add('order-confirmation', { orderId: 'o1' })).resolves.toBe(false)
    await expect(
      new QueuedOrderNotifier(broken).orderPlaced(placed('COD')),
    ).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(10_000)
    await broken.onApplicationShutdown()
  })
})

describe('customer events → notification jobs (step 28)', () => {
  const nConnection = producerConnection(REDIS_URL)
  const nQueue = createNotificationsQueue(nConnection, `test-${randomUUID()}`)
  const customer = new QueuedCustomerNotifier(new NotificationsQueueService(nQueue))
  const nJobs = async () =>
    (await nQueue.getJobs(['waiting'])).map((j) => ({ name: j.name, id: j.id, data: j.data }))

  afterEach(() => nQueue.obliterate({ force: true }))
  afterAll(async () => {
    await nQueue.close()
    await nConnection.quit()
  })

  it('each event once, with a fixed id', async () => {
    await customer.welcome('u1')
    await customer.welcome('u1')
    await customer.returnApproved('r1')
    await customer.refundProcessed('f1')
    await customer.orderShipped('o1')
    expect((await nJobs()).sort((a, b) => a.id!.localeCompare(b.id!))).toEqual([
      { name: 'order-shipped', id: 'order-shipped_o1', data: { orderId: 'o1' } },
      { name: 'refund-processed', id: 'refund-processed_f1', data: { refundId: 'f1' } },
      { name: 'return-approved', id: 'return-approved_r1', data: { returnId: 'r1' } },
      { name: 'welcome', id: 'welcome_u1', data: { userId: 'u1' } },
    ])
  })

  it('newsletter: the same token is one job; a new token (signed up again) is a new one', async () => {
    await customer.newsletterSignup('s1', 'a'.repeat(64))
    await customer.newsletterSignup('s1', 'a'.repeat(64))
    await customer.newsletterSignup('s1', 'b'.repeat(64))
    expect((await nJobs()).map((j) => j.id).sort()).toEqual([
      `newsletter-confirm_s1_${'a'.repeat(12)}`,
      `newsletter-confirm_s1_${'b'.repeat(12)}`,
    ])
  })
})
