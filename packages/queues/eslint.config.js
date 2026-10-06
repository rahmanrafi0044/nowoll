import base from '@nowoll/config/eslint/base'

export default [...base, { files: ['scripts/**'], rules: { 'no-console': 'off' } }]
