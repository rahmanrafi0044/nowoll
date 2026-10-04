// Public (browser-safe) configuration.
//
// Next.js copies NEXT_PUBLIC_* values into the JavaScript bundle at build time,
// and it only does so for the literal text `process.env.NEXT_PUBLIC_X` — so
// each one must be written out in full here, not looked up dynamically.
// NEVER add a non-NEXT_PUBLIC secret to this file.
export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
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
