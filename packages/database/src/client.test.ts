import { describe, expect, it } from 'vitest'
import { createPrismaClient } from './client'

describe('createPrismaClient', () => {
  it('throws a helpful error when no connection string is available', () => {
    const original = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      expect(() => createPrismaClient()).toThrow(/DATABASE_URL is not set/)
    } finally {
      process.env.DATABASE_URL = original
    }
  })

  it('creates a client without connecting (connections open lazily on first query)', async () => {
    const client = createPrismaClient('postgresql://user:pass@localhost:5432/does_not_matter')
    expect(client).toBeDefined()
    await client.$disconnect()
  })
})
