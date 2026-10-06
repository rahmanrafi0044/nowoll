import type { ConfigService } from '@nestjs/config'
import { type EnvironmentVariables, NodeEnv } from '../config/env.validation.js'
import type { CookieSettings } from './auth-cookies.js'
import { SupabaseAuthProvider } from './supabase-auth-provider.js'

export const AUTH_CONFIG = 'AUTH_CONFIG'

export interface AuthConfig {
  /** The shop's address — password-reset links point at {siteUrl}/reset-password. */
  siteUrl: string
  cookies: CookieSettings
}

type Config = ConfigService<EnvironmentVariables, true>

export function authConfigFrom(config: Config): AuthConfig {
  return {
    siteUrl: config.get('NEXT_PUBLIC_SITE_URL', { infer: true }).replace(/\/+$/, ''),
    cookies: {
      // Browsers only send Secure cookies over https — production. (Locally the apps run on http.)
      secure: config.get('NODE_ENV', { infer: true }) === NodeEnv.Production,
      domain: config.get('COOKIE_DOMAIN', { infer: true }),
    },
  }
}

export function supabaseAuthFromConfig(config: Config): SupabaseAuthProvider {
  return new SupabaseAuthProvider(
    config.get('NEXT_PUBLIC_SUPABASE_URL', { infer: true }),
    config.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', { infer: true }),
    config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
  )
}
