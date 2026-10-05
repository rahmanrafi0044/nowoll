import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SettingsModule } from '../settings/settings.module.js'
import {
  PAYMENT_GATEWAY,
  PAYMENTS_CONFIG,
  paymentsConfigFrom,
  sslCommerzFromConfig,
} from './payment-gateway.js'
import { PaymentsController } from './payments.controller.js'
import { PaymentsService } from './payments.service.js'

// Payments never cancel orders (decisions #2 and #3), so this module doesn't
// need the orders module — the dependency only goes one way: orders → payments.
@Module({
  imports: [SettingsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // FACTORY PROVIDER: builds the SSLCommerz adapter from the validated env.
    { provide: PAYMENT_GATEWAY, inject: [ConfigService], useFactory: sslCommerzFromConfig },
    { provide: PAYMENTS_CONFIG, inject: [ConfigService], useFactory: paymentsConfigFrom },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
