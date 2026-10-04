import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js'
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js'
import { type EnvironmentVariables, parseAllowedOrigins } from './config/env.validation.js'

export const API_PREFIX = 'api/v1'

// All app-wide middleware in ONE function, used by both main.ts and the
// integration tests — so the tests exercise exactly what production runs.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService)

  // Every route lives under /api/v1/… so a future /api/v2 can coexist.
  app.setGlobalPrefix(API_PREFIX)

  // In production the API sits behind Nginx. Trusting one proxy hop lets us see
  // the customer's real IP (from X-Forwarded-For) — essential for per-IP rate limiting.
  app.set('trust proxy', 1)

  // Helmet sets security headers (Content-Security-Policy, X-Frame-Options, …).
  app.use(helmet())

  // Only our own storefront and admin may call the API from a browser.
  // credentials: true is required for the HttpOnly auth cookie (Phase 4).
  app.enableCors({
    origin: parseAllowedOrigins(config.get('ALLOWED_ORIGIN', { infer: true })),
    credentials: true,
  })

  // Validate every request body/query against its DTO class:
  //   whitelist             → silently strip properties the DTO doesn't declare
  //   forbidNonWhitelisted  → …or rather, reject the request if any are sent
  //   transform             → turn plain JSON into DTO class instances ("12" → 12)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )

  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalInterceptors(new ResponseInterceptor())

  // Lets Docker stop the container gracefully (finish requests, close DB pool).
  app.enableShutdownHooks()
}
