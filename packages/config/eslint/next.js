// Shared ESLint config for the Next.js apps (storefront + admin).
// Built on Next's official rules (React, hooks, accessibility, Core Web Vitals)
// rather than our base config — both register the TypeScript plugin, and
// ESLint refuses to load the same plugin twice.
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // CLAUDE.md §13: always next/image, never <img>
      '@next/next/no-img-element': 'error',
    },
  },
  prettier,
])
