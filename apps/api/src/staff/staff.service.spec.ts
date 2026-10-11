import type { Prisma } from '@nowoll/database'
import { resetDatabase, testPrisma } from '../../test/utils/test-db.js'
import type { AuthProvider } from '../auth/auth-provider.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { StaffService } from './staff.service.js'

const prisma = testPrisma() as unknown as PrismaService
afterAll(() => prisma.$disconnect())
beforeEach(() => resetDatabase())

/**
 * Two admins removing EACH OTHER at the very same moment (step 38e). Both
 * changes are held right AFTER their "is there another admin?" check until
 * both have made it — the exact moment a plain transaction would let both
 * through and leave the shop with no admin. The SERIALIZABLE transaction
 * must refuse one of them.
 */
class HeldAtTheCheck extends StaffService {
  private arrived = 0
  private release!: () => void
  private readonly bothChecked = new Promise<void>((r) => (this.release = r))

  protected override async keepOneAdmin(tx: Prisma.TransactionClient, leavingId: string) {
    await super.keepOneAdmin(tx, leavingId)
    if (++this.arrived === 2) this.release()
    await this.bothChecked
  }
}

it('two admins removing each other at the same moment: one is refused, one admin remains', async () => {
  const [a, b] = await Promise.all(
    ['a@nowoll.test', 'b@nowoll.test'].map((email) =>
      prisma.user.create({
        data: { id: crypto.randomUUID(), email, role: 'ADMIN' },
      }),
    ),
  )
  const service = new HeldAtTheCheck(prisma, {} as AuthProvider)
  const results = await Promise.allSettled([
    service.changeRole(b!.id, 'STAFF', a!.id),
    service.changeRole(a!.id, 'STAFF', b!.id),
  ])
  expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
  const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
  expect(refused.reason.response.code).toBe('STAFF_CHANGED')
  expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1)
})
