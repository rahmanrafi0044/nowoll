import base from '@nowoll/config/eslint/base'

export default [...base, { files: ['prisma/seed.ts'], rules: { 'no-console': 'off' } }]
