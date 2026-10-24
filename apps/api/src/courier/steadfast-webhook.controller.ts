import {
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SkipThrottle } from '@nestjs/throttler'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { CourierUpdatesService } from './courier-updates.service.js'

// POST /api/v1/webhooks/steadfast — Steadfast tells us when a parcel moves
// (docs/integrations/courier.md → Webhook). Set in the Steadfast dashboard →
// Webhook: callback URL https://api.nowoll.com/api/v1/webhooks/steadfast and an
// auth token, which must ALSO be in the server .env as STEADFAST_WEBHOOK_TOKEN.
//
// SECURITY: anyone on the internet can POST here. A request is only believed
// when BOTH match the token (compared in constant time):
//   Authorization: Bearer <token>
//   X-Signature:   HMAC-SHA256(raw body, token), hex
// No token configured → 404, as if the address didn't exist.
// Steadfast waits 5 s and retries a 5xx/no answer (not a 4xx); repeats are
// harmless here (the same status changes nothing more).
@Controller('webhooks/steadfast')
@SkipThrottle() // a burst of deliveries must never be rate-limited away
export class SteadfastWebhookController {
  constructor(
    private readonly updates: CourierUpdatesService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-signature') signature: string | undefined,
  ) {
    const token = this.config.get('STEADFAST_WEBHOOK_TOKEN', { infer: true })
    if (!token) throw new NotFoundException('Not found')
    const raw = req.rawBody ?? Buffer.alloc(0)
    const expected = createHmac('sha256', token).update(raw).digest('hex')
    if (
      !same(authorization ?? '', `Bearer ${token}`) ||
      !same((signature ?? '').toLowerCase(), expected)
    )
      throw new UnauthorizedException('Invalid signature')

    const event = parse(raw)
    if (
      event?.notification_type === 'delivery_status' &&
      event.consignment_id != null &&
      typeof event.status === 'string'
    ) {
      const outcome = await this.updates.parcelStatus(
        'Steadfast',
        String(event.consignment_id),
        event.status,
      )
      return { status: 'success', outcome }
    }
    // Other events (tracking_update, payment_request, …) — nothing to do yet.
    return { status: 'success', outcome: 'ignored' }
  }
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

interface SteadfastEvent {
  notification_type?: string
  consignment_id?: number | string
  status?: string
}

function parse(raw: Buffer): SteadfastEvent | null {
  try {
    const v: unknown = JSON.parse(raw.toString('utf8'))
    return typeof v === 'object' && v !== null ? (v as SteadfastEvent) : null
  } catch {
    return null
  }
}
