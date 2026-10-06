// Public (browser-safe) configuration — see apps/storefront/src/lib/env.ts for
// why each value must be written out as `process.env.NEXT_PUBLIC_X`.
// (No Supabase keys: since step 29a the admin app talks only to our API.)
export const publicEnv = {
  adminUrl: process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3002',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
}
