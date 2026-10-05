import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    // At most 2 test workers: browser-simulating (jsdom) workers are memory-hungry,
    // and the default (one per CPU core) can exhaust a 4 GB laptop/WSL setup.
    maxWorkers: 2,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
