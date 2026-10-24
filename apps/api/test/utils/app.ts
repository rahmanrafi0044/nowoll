import type { ExecutionContext } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { AppModule } from '../../src/app.module.js'
import { configureApp } from '../../src/app.setup.js'
import { AUTH_PROVIDER } from '../../src/auth/auth-provider.js'
import { AdminGuard } from '../../src/common/guards/admin.guard.js'
import { LOW_STOCK_ALERTER } from '../../src/inventory/low-stock-alerter.js'
import { CUSTOMER_NOTIFIER } from '../../src/notifications/customer-notifier.js'
import { ORDER_NOTIFIER } from '../../src/orders/order-notifier.js'
import { META_SENDER } from '../../src/marketing/meta-sender.js'
import { COURIER } from '../../src/courier/courier.js'
import { PAYMENT_GATEWAY } from '../../src/payments/payment-gateway.js'
import { IMAGE_STORAGE } from '../../src/storage/image-storage.js'
import { FakeAuthProvider } from './fake-auth-provider.js'
import { FakeCourier } from './fake-courier.js'
import { FakeMetaSender } from './fake-meta-sender.js'
import { FakePaymentGateway } from './fake-payment-gateway.js'
import { MemoryImageStorage } from './memory-image-storage.js'
import {
  RecordingCustomerNotifier,
  RecordingLowStockAlerter,
  RecordingOrderNotifier,
} from './services.js'

/**
 * Boots the real API (real middleware, real nowoll_test database).
 * asAdmin: true swaps AdminGuard for one that skips sign-in, so feature
 * tests needn't sign in; `role` decides what the role check sees. The REAL guard (staff + 2FA) is tested in
 * admin-auth.e2e-spec.ts, which signs in for real with test/utils/admin.ts.
 * Image storage is ALWAYS the in-memory fake — tests never touch real Supabase.
 * Get it with app.get(IMAGE_STORAGE).
 * Low-stock alerts and order events are recorded, never queued: app.get(LOW_STOCK_ALERTER).alerts
 * SSLCommerz is ALWAYS the fake — tests never move money: app.get(PAYMENT_GATEWAY)
 * Supabase Auth is ALWAYS the fake — tests never create real accounts: app.get(AUTH_PROVIDER)
 * Meta is ALWAYS the fake — tests never reach Meta: app.get(META_SENDER) (step 39b)
 * The courier is ALWAYS the fake — tests never book a parcel: app.get(COURIER) (Phase 2)
 */
export async function createTestApp(options: {
  asAdmin: boolean
  /** With asAdmin: the role the stand-in admin has (default ADMIN). STAFF tests the role checks (step 38e). */
  role?: 'ADMIN' | 'STAFF'
}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IMAGE_STORAGE)
    .useValue(new MemoryImageStorage())
    .overrideProvider(LOW_STOCK_ALERTER)
    .useValue(new RecordingLowStockAlerter())
    .overrideProvider(ORDER_NOTIFIER) // never Redis in tests: app.get(ORDER_NOTIFIER).placed / .paid
    .useValue(new RecordingOrderNotifier())
    .overrideProvider(CUSTOMER_NOTIFIER) // app.get(CUSTOMER_NOTIFIER).events
    .useValue(new RecordingCustomerNotifier())
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue(new FakePaymentGateway())
    .overrideProvider(AUTH_PROVIDER)
    .useValue(new FakeAuthProvider())
    .overrideProvider(META_SENDER)
    .useValue(new FakeMetaSender())
    .overrideProvider(COURIER) // never a real parcel: app.get(COURIER).booked
    .useValue(new FakeCourier())
  if (options.asAdmin) {
    const role = options.role ?? 'ADMIN'
    // Stands in for sign-in + 2FA only; the REAL role check (AdminRoleGuard) still runs.
    builder = builder.overrideGuard(AdminGuard).useValue({
      canActivate: (ctx: ExecutionContext) => {
        ctx.switchToHttp().getRequest<{ adminRole?: string }>().adminRole = role
        return true
      },
    })
  }
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>({
    rawBody: true, // as in main.ts (webhook signatures)
    logger: false,
  })
  configureApp(app)
  await app.init()
  return app
}
