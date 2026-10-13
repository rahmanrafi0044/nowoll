import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { verifySvixSignature } from '../webhooks/svix-signature.js'
import { SubscribersService } from './subscribers.service.js'

// POST /api/v1/webhooks/resend — Resend tells us when a contact changes
// (step 42, docs/integrations/resend.md). Only `contact.updated` with
// unsubscribed: true does anything: that person clicked "unsubscribe" in a
// Broadcast, so our list must say so too (we must never email them again).
// Every request must carry Resend's signature over the RAW body.
@Controller('webhooks/resend')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name)

  constructor(
    private readonly subscribers: SubscribersService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') id: string | undefined,
    @Headers('svix-timestamp') timestamp: string | undefined,
    @Headers('svix-signature') signature: string | undefined,
  ) {
    const secret = this.config.get('RESEND_WEBHOOK_SECRET', { infer: true })
    if (!secret) throw new NotFoundException('Not found') // not set up → as if it didn't exist
    if (
      !verifySvixSignature({
        id,
        timestamp,
        signature,
        rawBody: req.rawBody,
        secret,
        now: new Date(),
      })
    )
      throw new UnauthorizedException('Invalid signature')

    const event = parse(req.rawBody!)
    if (event?.type !== 'contact.updated' || event.data?.unsubscribed !== true || !event.data.email)
      return { received: true, action: 'none' }
    const at = new Date(event.data.updated_at ?? event.created_at ?? Date.now())
    const action = await this.subscribers.unsubscribedInResend(event.data.email, at)
    if (action === 'unsubscribed') this.logger.log('A subscriber unsubscribed in Resend')
    return { received: true, action }
  }
}

interface ContactEvent {
  type?: string
  created_at?: string
  data?: { email?: string; unsubscribed?: boolean; updated_at?: string }
}

function parse(raw: Buffer): ContactEvent | null {
  try {
    const v: unknown = JSON.parse(raw.toString('utf8'))
    return typeof v === 'object' && v !== null ? (v as ContactEvent) : null
  } catch {
    return null
  }
}
