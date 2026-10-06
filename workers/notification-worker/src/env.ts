import { z } from '@nowoll/validation'

// FAIL-FAST: a missing setting stops the worker at start-up with a clear message.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\/.+/, 'REDIS_URL must look like redis://host:6379')
    .default('redis://localhost:6379'),
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  // Sender settings are checked by emailSenderFromEnv (@nowoll/email).
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_USE_RESEND: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
})

export type WorkerEnv = z.infer<typeof schema>

export function parseEnv(env: NodeJS.ProcessEnv): WorkerEnv {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid environment variables:\n  - ${problems.join('\n  - ')}`)
  }
  return parsed.data
}
