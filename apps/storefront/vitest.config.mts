import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom', // a fake browser (window, document, localStorage) for component tests
    // At most 2 test workers: browser-simulating (jsdom) workers are memory-hungry,
    // and the default (one per CPU core) can exhaust a 4 GB laptop/WSL setup.
    maxWorkers: 2,
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
