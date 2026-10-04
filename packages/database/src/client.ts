import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

// FACTORY PATTERN: one function that knows how to build a correctly configured
// PrismaClient. Apps never call `new PrismaClient()` themselves, so connection
// settings live in exactly one place.
//
// Prisma 7 talks to Postgres through a "driver adapter" (here: node-postgres).
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })
}
