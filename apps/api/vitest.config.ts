import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // NestJS and class-validator read decorator metadata via the reflect-metadata polyfill.
    setupFiles: ['reflect-metadata'],
    // *.spec.ts = unit tests next to the code; test/*.e2e-spec.ts = HTTP-level integration tests
    // Fixed values so tests never depend on (or touch) your real .env / database.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/not_used_by_tests',
      ALLOWED_ORIGIN: 'http://localhost:3000,http://localhost:3002',
    },
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  },
})
