import { plainToInstance, Type } from 'class-transformer'
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator'

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

  return env
}

export function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
