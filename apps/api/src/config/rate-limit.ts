// Rate limits from CLAUDE.md §8. These are security settings, not business
// rules, so they live in code (one place) rather than the settings table.
const ONE_MINUTE_MS = 60_000

export const GLOBAL_RATE_LIMIT = { ttl: ONE_MINUTE_MS, limit: 100 }

// For /auth/* and /payment/* — slows down password guessing and payment abuse.
export const STRICT_RATE_LIMIT = { ttl: ONE_MINUTE_MS, limit: 5 }
