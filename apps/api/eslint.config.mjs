import base from '@nowoll/config/eslint/base'

export default [
  ...base,
  {
    rules: {
      // NestJS modules are often empty classes decorated with @Module — that's normal.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
]
