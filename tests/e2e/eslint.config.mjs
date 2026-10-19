import base from '@nowoll/config/eslint/base'

// The runner and seed are command-line scripts: printing progress is their job.
export default [
  ...base,
  { ignores: ['playwright-report/**', 'test-results/**', 'lighthouse-report/**'] },
  { files: ['run-e2e.ts', 'support/seed.ts'], rules: { 'no-console': 'off' } },
]
