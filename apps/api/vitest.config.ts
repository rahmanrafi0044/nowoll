import { defineConfig } from 'vitest/config'

const TEST_DATABASE_URL = 'postgresql://nowoll:nowoll_local_password@localhost:5432/nowoll_test'

export default defineConfig({
  test: {
    globals: true,
    // NestJS and class-validator read decorator metadata via the reflect-metadata polyfill.
    setupFiles: ['reflect-metadata'],
    // Creates + migrates the nowoll_test database before any test runs.
    globalSetup: ['./test/global-setup.ts'],
    // Database tests share one test database and wipe it between tests,
    // so test FILES must run one at a time, not in parallel.
    fileParallelism: false,
    // Fixed values so tests never depend on (or touch) your real .env / dev database.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_DATABASE_URL,
      ALLOWED_ORIGIN: 'http://localhost:3000,http://localhost:3002',
      // Dummy values: tests swap in an in-memory image store (test/utils/app.ts),
      // so nothing is ever uploaded to the real Supabase project.
      NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      // Dummy credentials switch "Pay online" on; the gateway itself is always the
      // fake (test/utils/fake-payment-gateway.ts) — no test ever calls SSLCommerz.
      SSLCOMMERZ_STORE_ID: 'test-store',
      SSLCOMMERZ_STORE_PASSWORD: 'test-store-password',
      SSLCOMMERZ_IS_LIVE: 'false',
      API_PUBLIC_URL: 'https://api.nowoll.test',
      NEXT_PUBLIC_SITE_URL: 'https://nowoll.test',
    },
    // *.spec.ts = unit tests next to the code; test/*.e2e-spec.ts = HTTP-level integration tests
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  },
})
