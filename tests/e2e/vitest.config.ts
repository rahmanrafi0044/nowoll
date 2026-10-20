import { defineConfig } from 'vitest/config'

// Unit tests of the e2e package's own tools (the launch check). The Playwright
// browser tests in specs/ are run by `pnpm test:e2e`, never by Vitest.
export default defineConfig({ test: { include: ['launch-check/**/*.test.ts'] } })
