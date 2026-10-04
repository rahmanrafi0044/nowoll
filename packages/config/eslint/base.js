// Shared ESLint "flat config" used by every workspace.
// Each app imports this array and appends framework-specific rules (Next.js, NestJS).
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Unused variables are usually bugs; allow the `_unused` naming convention for intentional ones.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // console.log left in production code leaks data; use the Nest Logger or Sentry instead.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Must be last: turns off stylistic rules that would fight with Prettier.
  prettier,
)
