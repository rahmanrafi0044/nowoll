import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { AppModule } from '../../src/app.module.js'
import { configureApp } from '../../src/app.setup.js'
import { AdminGuard } from '../../src/common/guards/admin.guard.js'

/**
 * Boots the real API (real middleware, real nowoll_test database).
 * asAdmin: true swaps the deny-all AdminGuard for one that allows everything —
 * real admin sign-in arrives in Phase 4.
 */
export async function createTestApp(options: {
  asAdmin: boolean
}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
  if (options.asAdmin)
    builder = builder.overrideGuard(AdminGuard).useValue({ canActivate: () => true })
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>({
    logger: false,
  })
  configureApp(app)
  await app.init()
  return app
}
