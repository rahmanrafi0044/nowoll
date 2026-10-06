import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AddressesModule } from './addresses/addresses.module.js'
import { AdminAuthModule } from './admin-auth/admin-auth.module.js'
import { AuthModule } from './auth/auth.module.js'
import { CategoriesModule } from './categories/categories.module.js'
import { validateEnv } from './config/env.validation.js'
import { GLOBAL_RATE_LIMIT } from './config/rate-limit.js'
import { HealthModule } from './health/health.module.js'
import { ProductsModule } from './products/products.module.js'
import { StorageModule } from './storage/storage.module.js'
import { InventoryModule } from './inventory/inventory.module.js'
import { ContentModule } from './content/content.module.js'
import { SubscribersModule } from './subscribers/subscribers.module.js'
import { DiscountsModule } from './discounts/discounts.module.js'
import { CartModule } from './cart/cart.module.js'
import { CheckoutModule } from './checkout/checkout.module.js'
import { ShippingModule } from './shipping/shipping.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { PaymentsModule } from './payments/payments.module.js'
import { ReturnsModule } from './returns/returns.module.js'
import { ReviewsModule } from './reviews/reviews.module.js'
import { WishlistModule } from './wishlist/wishlist.module.js'
import { PrismaModule } from './prisma/prisma.module.js'

// The root module: wires together config, database, rate limiting and every
// feature module. New features (categories, products, …) get imported here.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Local dev: the single .env at the repo root. Production (Docker): real
      // environment variables are used and this file simply doesn't exist.
      envFilePath: ['../../.env'],
      validate: validateEnv,
    }),
    // Runs timed jobs like the unpaid-order sweep (until BullMQ in Phase 4).
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ...GLOBAL_RATE_LIMIT }]),
    PrismaModule,
    NotificationsModule,
    StorageModule,
    HealthModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    ContentModule,
    SubscribersModule,
    DiscountsModule,
    CartModule,
    ShippingModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    AuthModule,
    AdminAuthModule,
    AddressesModule,
    WishlistModule,
    ReviewsModule,
    ReturnsModule,
  ],
  providers: [
    // Registering the guard globally applies the 100 req/min limit to every route.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
