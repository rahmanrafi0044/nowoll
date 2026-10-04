// Prisma 7 keeps connection settings here instead of inside schema.prisma.
// The single .env file lives at the repo root, so we load it from there.
import { config } from 'dotenv'
import path from 'node:path'
import { defineConfig, env } from 'prisma/config'

config({ path: path.resolve(__dirname, '../../.env') })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `pnpm db:seed` (and `prisma migrate reset`) run this to insert default data.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
