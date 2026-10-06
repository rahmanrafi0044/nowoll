import { z } from 'zod'

// ── Passwords (step 22) ───────────────────────────────────────────────────
// At least 8 characters (Supabase's own minimum is 6 — we ask for more).
// At most 72: Supabase stores passwords with bcrypt, which only uses the
// first 72 bytes — a longer "password" would silently be cut short.
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: `Use at least ${PASSWORD_MIN_LENGTH} characters` })
  .max(PASSWORD_MAX_LENGTH, { message: `Use at most ${PASSWORD_MAX_LENGTH} characters` })
