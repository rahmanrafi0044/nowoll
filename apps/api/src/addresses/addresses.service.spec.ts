// The per-customer lock behind "exactly one default address", proven
// deterministically: we hold a lock on the customer's row in our own
// transaction and check that an address change WAITS for it. (Racing two HTTP
// requests can pass by luck — they often run one after the other anyway.)
//
// Which lock we hold matters. Saving an address makes Postgres check the
// customer exists (foreign key), taking a light FOR KEY SHARE lock on the
// users row. FOR UPDATE would block that check too — the change would wait
// even WITHOUT the service's own lock, and this test would prove nothing.
// FOR NO KEY UPDATE lets the foreign-key check through but conflicts with the
// service's FOR UPDATE — so the change can only wait if the service locks.
import { randomUUID } from 'node:crypto'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { AddressesService } from './addresses.service.js'

const prisma = testPrisma() as unknown as PrismaService
const addresses = new AddressesService(prisma)

beforeEach(() => resetDatabase())
afterAll(() => prisma.$disconnect())

const home = {
  fullName: 'Rafi Rahman',
  phone: '+8801712345678',
  division: 'Dhaka',
  district: 'Dhaka',
  addressLine1: 'House 12, Road 5',
}

it('an address change waits while another change for the same customer holds the lock', async () => {
  const user = await prisma.user.create({ data: { id: randomUUID(), email: 'rafi@example.com' } })
  await addresses.create(user.id, home)
  const office = await addresses.create(user.id, { ...home, addressLine1: 'Level 4' })

  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  let locked!: () => void
  const lockTaken = new Promise<void>((r) => (locked = r))
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR NO KEY UPDATE`
      locked()
      await held
    },
    { timeout: 10_000 },
  )
  await lockTaken

  let finished = false
  const change = addresses
    .update(user.id, office.id, { isDefault: true })
    .then(() => (finished = true))
  await new Promise((r) => setTimeout(r, 400))
  expect(finished).toBe(false) // waiting for the lock — not changing defaults alongside another change

  release()
  await holder
  await change
  expect(finished).toBe(true)
  expect(
    (await addresses.list(user.id)).filter((a) => a.isDefault).map((a) => a.addressLine1),
  ).toEqual(['Level 4'])
})

it("a different customer's change doesn't wait (the lock is per customer)", async () => {
  const a = await prisma.user.create({ data: { id: randomUUID(), email: 'a@example.com' } })
  const b = await prisma.user.create({ data: { id: randomUUID(), email: 'b@example.com' } })
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  let locked!: () => void
  const lockTaken = new Promise<void>((r) => (locked = r))
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${a.id}::uuid FOR NO KEY UPDATE`
      locked()
      await held
    },
    { timeout: 10_000 },
  )
  await lockTaken
  await expect(addresses.create(b.id, home)).resolves.toMatchObject({ isDefault: true })
  release()
  await holder
})
