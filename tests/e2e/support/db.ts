// Direct database access FOR CHECKING results (and staging rare situations,
// like stock running out mid-checkout). Tests never use it to fake the flow itself.
import { createPrismaClient } from '@nowoll/database'
import { E2E_DATABASE_URL } from './env.js'

let client: ReturnType<typeof createPrismaClient> | undefined
export const e2eDb = () => (client ??= createPrismaClient(E2E_DATABASE_URL))

export async function stockOf(sku: string): Promise<number> {
  return (await e2eDb().productVariant.findUniqueOrThrow({ where: { sku } })).stock
}

export async function setStock(sku: string, stock: number): Promise<void> {
  await e2eDb().productVariant.update({ where: { sku }, data: { stock } })
}
