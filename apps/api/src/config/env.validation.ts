import { plainToInstance, Transform, Type } from 'class-transformer'
import { isSslCommerzConfigured } from '@nowoll/payments'
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator'

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

// FAIL-FAST PATTERN: check every required environment variable when the
// server boots. A missing DATABASE_URL should stop the app immediately with a
// clear message — not crash on the first customer's checkout.
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development // explicit types are required: validation reads them at runtime

  // Env vars always arrive as strings ("3001"); @Type converts to a number
  // before validation. (The explicit `: number` matters too — see NodeEnv above.)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string

  // Comma-separated list of frontends allowed to call the API,
  // e.g. "https://nowoll.com,https://admin.nowoll.com"
  @IsString()
  @IsNotEmpty()
  ALLOWED_ORIGIN!: string

  // Supabase project URL. It's public (the browser apps use it too), so the
  // API reuses the same variable rather than a second copy of it.
  @IsUrl({ require_tld: false })
  NEXT_PUBLIC_SUPABASE_URL!: string

  // Supabase's PUBLIC "anon" key (the browser apps have it too). The API uses
  // it for customer sign-in calls (step 22) — the service role key below is
  // only for admin-level calls like creating accounts.
  @IsString()
  @IsNotEmpty()
  NEXT_PUBLIC_SUPABASE_ANON_KEY!: string

  // SERVER ONLY. Full access to Supabase Storage (bypasses RLS) — used to
  // upload and delete product images. Never sent to a browser.
  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_ROLE_KEY!: string

  // SSLCommerz (docs/integrations/sslcommerz.md). Optional in development —
  // "Pay online" then says it isn't set up — but REQUIRED in production.
  @IsOptional()
  @IsString()
  SSLCOMMERZ_STORE_ID?: string

  @IsOptional()
  @IsString()
  SSLCOMMERZ_STORE_PASSWORD?: string

  // "true" ONLY on the real shop. Anything else uses the sandbox (fake money).
  @IsOptional()
  @IsIn(['true', 'false'])
  SSLCOMMERZ_IS_LIVE?: 'true' | 'false'

  // Steadfast Courier (Phase 2, docs/integrations/courier.md) — SERVER ONLY,
  // never admin-editable (Rule 9). From the Steadfast merchant dashboard →
  // "API and plugins". Optional: without them "Book with Steadfast" says it
  // isn't connected and tracking numbers are entered by hand.
  @IsOptional()
  @IsString()
  STEADFAST_API_KEY?: string

  @IsOptional()
  @IsString()
  STEADFAST_SECRET_KEY?: string

  // The webhook's auth token (dashboard → Webhook → Auth token). SERVER ONLY.
  // Without it, POST /webhooks/steadfast answers 404 (delivery updates off).
  @IsOptional()
  @IsString()
  STEADFAST_WEBHOOK_TOKEN?: string

  // Meta Conversions API (step 39b, docs/integrations/meta.md). SERVER ONLY,
  // never admin-editable (CLAUDE.md Rule 9). Optional: without it, server
  // events are skipped and Admin → Marketing says the token is missing.
  @Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value))
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{50,500}$/, {
    message: 'META_CAPI_ACCESS_TOKEN must be the token from Meta (letters and numbers only)',
  })
  META_CAPI_ACCESS_TOKEN?: string

  // Resend webhook signing secret (step 42 — docs/integrations/resend.md). SERVER
  // ONLY, never admin-editable. Optional: without it the webhook answers 404.
  @Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value))
  @IsOptional()
  @Matches(/^whsec_[A-Za-z0-9+/=]{16,}$/, {
    message: 'RESEND_WEBHOOK_SECRET must be the signing secret from Resend (starts with whsec_)',
  })
  RESEND_WEBHOOK_SECRET?: string

  // Which site the login cookies belong to. Production: ".nowoll.com", so both
  // nowoll.com (the shop) and api.nowoll.com (this API) see them. Development:
  // leave empty — localhost cookies are already shared between ports.
  @Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value)) // "COOKIE_DOMAIN=" = not set
  @IsOptional()
  @Matches(/^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/, {
    message: 'COOKIE_DOMAIN must look like .nowoll.com',
  })
  COOKIE_DOMAIN?: string

  // The start of the login cookies' names (step 48): "nw" → nw_access. Staging
  // uses another ("nws"): production's cookies (Domain=.nowoll.com) also reach
  // the staging sites, and the same names would mix the two sessions.
  // Set it in the SERVER's .env (Docker passes it as a real environment
  // variable before the app starts); development keeps the default.
  @IsOptional()
  @Matches(/^[a-z]{2,8}$/, { message: 'COOKIE_PREFIX must be 2–8 lowercase letters, e.g. nws' })
  COOKIE_PREFIX?: string

  // Shared secret for the shop's own server (config/internal-request.ts) —
  // skips the per-visitor rate limit. Unset = nobody skips it.
  @Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value))
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{32,}$/, {
    message: 'INTERNAL_API_KEY must be at least 32 letters/digits (openssl rand -hex 32)',
  })
  INTERNAL_API_KEY?: string

  // Redis: the background job queues (BullMQ, step 27 — CLAUDE.md §10).
  @Matches(/^rediss?:\/\/.+/, { message: 'REDIS_URL must look like redis://host:6379' })
  REDIS_URL: string = 'redis://localhost:6379'

  // The API's own public address. SSLCommerz sends payment notifications and
  // the customer's browser back to it, so in production it must be the real
  // https address (e.g. https://api.nowoll.com) — never localhost.
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  API_PUBLIC_URL: string = 'http://localhost:3001'

  // The storefront's address: after paying, customers are sent back here.
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  NEXT_PUBLIC_SITE_URL: string = 'http://localhost:3000'
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true })
  const errors = validateSync(env, { skipMissingProperties: false })

  if (errors.length > 0) {
    const problems = errors.flatMap((e) => Object.values(e.constraints ?? {}))
    throw new Error(`Invalid environment variables:\n  - ${problems.join('\n  - ')}`)
  }

  if (parseAllowedOrigins(env.ALLOWED_ORIGIN).includes('*')) {
    throw new Error(
      'ALLOWED_ORIGIN must list exact origins — wildcard "*" is not allowed (CLAUDE.md §8).',
    )
  }

  // Step 19 decision #7: a production server without payment credentials
  // must not start (it would take orders it can't charge for).
  if (
    env.NODE_ENV === NodeEnv.Production &&
    !isSslCommerzConfigured({
      storeId: env.SSLCOMMERZ_STORE_ID,
      storePassword: env.SSLCOMMERZ_STORE_PASSWORD,
    })
  ) {
    throw new Error(
      'Invalid environment variables:\n  - SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD must be set in production',
    )
  }
  // Production: the shop (nowoll.com) and API (api.nowoll.com) must share the login cookies.
  if (env.NODE_ENV === NodeEnv.Production && !env.COOKIE_DOMAIN) {
    throw new Error(
      'Invalid environment variables:\n  - COOKIE_DOMAIN must be set in production (e.g. .nowoll.com)',
    )
  }

  // Payment notifications must reach the real, encrypted address in production.
  if (env.NODE_ENV === NodeEnv.Production) {
    const insecure = (['API_PUBLIC_URL', 'NEXT_PUBLIC_SITE_URL'] as const).filter(
      (key) => !env[key].startsWith('https://'),
    )
    if (insecure.length > 0) {
      throw new Error(
        `Invalid environment variables:\n  - ${insecure.join(' and ')} must start with https:// in production`,
      )
    }
  }
  return env
}

export function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
