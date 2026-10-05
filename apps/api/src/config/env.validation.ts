import { plainToInstance, Type } from 'class-transformer'
import { isSslCommerzConfigured } from '@nowoll/payments'
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
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
  return env
}

export function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
