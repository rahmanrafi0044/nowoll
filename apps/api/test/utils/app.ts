import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { AppModule } from '../../src/app.module.js'
import { configureApp } from '../../src/app.setup.js'
import { AdminGuard } from '../../src/common/guards/admin.guard.js'
import { LOW_STOCK_ALERTER } from '../../src/inventory/low-stock-alerter.js'
import { PAYMENT_GATEWAY } from '../../src/payments/payment-gateway.js'
import { IMAGE_STORAGE } from '../../src/storage/image-storage.js'
import { FakePaymentGateway } from './fake-payment-gateway.js'
import { MemoryImageStorage } from './memory-image-storage.js'
import { RecordingLowStockAlerter } from './services.js'

/**
 * Boots the real API (real middleware, real nowoll_test database).
 * asAdmin: true swaps the deny-all AdminGuard for one that allows everything —
 * real admin sign-in arrives in Phase 4.
 * Image storage is ALWAYS the in-memory fake — tests never touch real Supabase.
 * Get it with app.get(IMAGE_STORAGE).
 * Low-stock alerts are recorded, not logged: app.get(LOW_STOCK_ALERTER).alerts
 * SSLCommerz is ALWAYS the fake — tests never move money: app.get(PAYMENT_GATEWAY)
 */
export async function createTestApp(options: {
  asAdmin: boolean
}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IMAGE_STORAGE)
    .useValue(new MemoryImageStorage())
    .overrideProvider(LOW_STOCK_ALERTER)
    .useValue(new RecordingLowStockAlerter())
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue(new FakePaymentGateway())
  if (options.asAdmin)
    builder = builder.overrideGuard(AdminGuard).useValue({ canActivate: () => true })
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>({
    logger: false,
  })
  configureApp(app)
  await app.init()
  return app
}
