import { createBrowserClient } from '@supabase/ssr'
import { publicEnv, requireEnv } from '@/lib/env'

// Supabase client for code running in the BROWSER ('use client' components).
//
// It uses the public "anon" key, which is safe to ship to browsers: every
// table has Row Level Security on with no public policies, so this key can't
// read or write our data. In Phase 4 it's used for Supabase Auth (login/
// register); product and order data always comes from our NestJS API.
//
// createBrowserClient returns the same instance on every call (singleton),
// so calling this from many components is cheap.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', publicEnv.supabaseUrl),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', publicEnv.supabaseAnonKey),
  )
}
