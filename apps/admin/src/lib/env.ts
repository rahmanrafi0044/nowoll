// Public (browser-safe) configuration — see apps/storefront/src/lib/env.ts for
// why each value must be written out as `process.env.NEXT_PUBLIC_X`.
export const publicEnv = {
  adminUrl: process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3002',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Add it to the root .env file (see .env.example).`)
  }
  return value
}
