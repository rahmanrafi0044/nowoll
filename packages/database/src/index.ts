import type { PrismaClient } from './generated/prisma/client'
import { createPrismaClient } from './client'

// SINGLETON PATTERN: every PrismaClient opens its own pool of database
// connections. In development, hot-reload re-runs this file on every save; without
// the globalThis cache we'd open a new pool each time and quickly hit Postgres's
// connection limit. Caching on globalThis survives reloads, so there's only ever one.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Created lazily on first use, so simply importing a type from this package
// never requires DATABASE_URL to be set.
export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient()
  return globalForPrisma.prisma
}

export { createPrismaClient }

// Re-export the generated client: PrismaClient, the Prisma namespace
// (Prisma.Decimal, Prisma.TransactionClient, …), every enum, and every model type.
export * from './generated/prisma/client'
