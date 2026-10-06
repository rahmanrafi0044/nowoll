import base from '@nowoll/config/eslint/base'

// The preview script prints which emails it sent.
export default [...base, { files: ['scripts/**'], rules: { 'no-console': 'off' } }]
