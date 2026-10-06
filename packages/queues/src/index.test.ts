import { randomUUID } from 'node:crypto'
import { createOrdersQueue, DEFAULT_JOB_OPTIONS, orderJobId, producerConnection } from './index.js'

// Real Redis (docker compose up -d redis; CI runs it as a service). A unique
// prefix per run keeps these test jobs away from a running dev worker.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const connection = producerConnection(REDIS_URL)
const queue = createOrdersQueue(connection, `test-${randomUUID()}`)

afterAll(async () => {
  await queue.obliterate({ force: true })
  await queue.close()
  await connection.quit()
})

describe('orders queue', () => {
  it('the same job ID twice is ONE job (no duplicate emails)', async () => {
    const id = orderJobId('order-confirmation', 10001)
    expect(id).toBe('order-confirmation_NW-10001') // no ":" — BullMQ forbids it in IDs
    await queue.add('order-confirmation', { orderId: 'o1' }, { jobId: id })
    await queue.add('order-confirmation', { orderId: 'o1' }, { jobId: id })
    expect(await queue.getJobCounts('waiting')).toEqual({ waiting: 1 })
  })

  it('every job gets the retry rules: 5 tries, doubling waits from 30 s', async () => {
    const job = await queue.add('low-stock-alert', { alerts: [] })
    expect(job.opts).toMatchObject({ attempts: 5, backoff: { type: 'exponential', delay: 30_000 } })
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toEqual({ age: 604_800, count: 5000 })
  })

  it('adding fails FAST when Redis is unreachable (checkout must never hang)', async () => {
    const dead = producerConnection('redis://localhost:1', { connectTimeout: 500 })
    const q = createOrdersQueue(dead, `test-${randomUUID()}`)
    const started = Date.now()
    await expect(q.add('order-confirmation', { orderId: 'o1' })).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(5_000)
    await q.close().catch(() => {})
    dead.disconnect()
  })
})
