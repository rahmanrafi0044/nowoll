import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { COURIER } from './courier.js'
import { CourierUpdatesService } from './courier-updates.service.js'
import { SteadfastWebhookController } from './steadfast-webhook.controller.js'
import { SteadfastCourier } from './steadfast.courier.js'

// The courier (Phase 2). @Global: the admin order service books through it.
// The keys come ONLY from the server .env (CLAUDE.md Rule 3 / Rule 9).
@Global()
@Module({
  controllers: [SteadfastWebhookController],
  providers: [
    CourierUpdatesService,
    {
      provide: COURIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new SteadfastCourier({
          apiKey: config.get('STEADFAST_API_KEY', { infer: true }),
          secretKey: config.get('STEADFAST_SECRET_KEY', { infer: true }),
        }),
    },
  ],
  exports: [COURIER],
})
export class CourierModule {}
