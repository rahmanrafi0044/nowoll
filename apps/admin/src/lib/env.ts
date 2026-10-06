// Public (browser-safe) configuration — see apps/storefront/src/lib/env.ts for
// why each value must be written out as `process.env.NEXT_PUBLIC_X`.
// No Supabase KEYS: since step 29a the admin app talks only to our API. The
// Supabase URL is here only because product photos are served from it.
export const publicEnv = {
  adminUrl: process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3002',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  /** The shop — demo photos (local dev only) are served from its /demo folder. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  /** Product photos live in Supabase Storage under this address. */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
}
