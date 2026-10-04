import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { AppModule } from '../../src/app.module.js'
import { configureApp } from '../../src/app.setup.js'
import { AdminGuard } from '../../src/common/guards/admin.guard.js'
import { IMAGE_STORAGE } from '../../src/storage/image-storage.js'
import { MemoryImageStorage } from './memory-image-storage.js'

/**
 * Boots the real API (real middleware, real nowoll_test database).
 * asAdmin: true swaps the deny-all AdminGuard for one that allows everything —
 * real admin sign-in arrives in Phase 4.
 * Image storage is ALWAYS the in-memory fake — tests never touch real Supabase.
 * Get it with app.get(IMAGE_STORAGE).
 */
export async function createTestApp(options: {
  asAdmin: boolean
}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IMAGE_STORAGE)
    .useValue(new MemoryImageStorage())
  if (options.asAdmin)
    builder = builder.overrideGuard(AdminGuard).useValue({ canActivate: () => true })
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>({
    logger: false,
  })
  configureApp(app)
  await app.init()
  return app
}
