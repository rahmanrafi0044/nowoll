// WHY jitless (security audit, step 53): Zod 4 tests once whether it may build
// faster checking code with `new Function()` — a form of eval. The shop's
// Content-Security-Policy forbids eval, so the browser blocks the test and
// reports a CSP violation (harmless — Zod falls back — but it would hide real
// ones). `jitless` skips the test; our schemas are small, so speed is the same.
// Imported FIRST by every file that creates schemas (not only index.ts): Zod
// reads the switch when each schema is created, and the shop's build loads
// those files directly, skipping index.ts (package.json "sideEffects").
import { config } from 'zod'

config({ jitless: true })
