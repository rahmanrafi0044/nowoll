import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Prisma } from './generated/prisma/client'

// The settings every PrismaClient in Nowoll is built with. Exported separately
// so NestJS's PrismaService (which extends PrismaClient) uses the exact same
// configuration as createPrismaClient below.
//
// Prisma 7 talks to Postgres through a "driver adapter" (here: node-postgres).
export function prismaClientOptions(
  connectionString = process.env.DATABASE_URL,
): Prisma.PrismaClientOptions {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }

  return {
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  }
}

// FACTORY PATTERN: one function that knows how to build a correctly configured
// PrismaClient, so connection settings live in exactly one place.
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  return new PrismaClient(prismaClientOptions(connectionString))
}
