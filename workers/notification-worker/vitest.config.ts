import { defineConfig } from 'vitest/config'

const TEST_DATABASE_URL =
  'postgresql://nowoll:nowoll_local_password@localhost:5432/nowoll_notify_test'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // Its OWN database: package tests run in parallel, and the API's tests wipe nowoll_test.
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    env: { NODE_ENV: 'test', TEST_DATABASE_URL, DATABASE_URL: TEST_DATABASE_URL },
  },
})
