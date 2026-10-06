import base from '@nowoll/config/eslint/base'

// A command-line process: its log lines ARE its output.
export default [...base, { rules: { 'no-console': 'off' } }]
