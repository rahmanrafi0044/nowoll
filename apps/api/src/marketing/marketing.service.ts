import { randomUUID } from 'node:crypto'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { buildServerEvent } from '@nowoll/analytics/server'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { SettingsService } from '../settings/settings.service.js'
import { META_SENDER, type MetaSender } from './meta-sender.js'

// Admin → Marketing (step 39b): the setup checklist, a "send test event"
// button and the delivery log. Real order events are sent by the worker
// (workers/notification-worker); this only sends the admin's test event.

const LOG_SIZE = 100

/** What "Send test event" answers: Meta's count and warnings, or its error. */
export type TestEventResult =
  | { ok: true; eventsReceived: number; messages: string[] }
  | { ok: false; message: string; tokenProblem: boolean }

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @Inject(META_SENDER) private readonly meta: MetaSender,
  ) {}

  /** The checklist. Never the token — only whether it is set. */
  async status() {
    const s = await this.settings.all()
    const [lastSent, lastFailed] = await Promise.all([
      this.prisma.metaEvent.findFirst({
        where: { status: 'SENT', test: false },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.metaEvent.findFirst({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, message: true },
      }),
    ])
    return {
      pixelIdSet: s.meta_pixel_id !== '',
      domainVerificationSet: s.meta_domain_verification !== '',
      tokenSet: this.meta.tokenSet,
      serverEventsOn: s.meta_capi_enabled,
      lastSentAt: lastSent?.createdAt ?? null,
      lastFailure: lastFailed ? { at: lastFailed.createdAt, message: lastFailed.message } : null,
    }
  }

  /**
   * One test Purchase, sent now with Meta's test code, so Rafi sees it in
   * Events Manager → Test events. It uses the admin's OWN email and browser —
   * never a customer's details — and is marked "test" in the log.
   */
  async sendTest(
    testEventCode: string,
    admin: { email: string },
    ip: string,
    userAgent: string,
  ): Promise<TestEventResult> {
    const s = await this.settings.all()
    if (!s.meta_pixel_id)
      throw new BadRequestException(
        'Add the Meta Pixel ID first (Settings → Marketing and tracking).',
      )
    if (!this.meta.tokenSet)
      throw new BadRequestException(
        'The access token is not set on the server yet (META_CAPI_ACCESS_TOKEN — see the guide).',
      )
    const siteUrl = this.config.get('NEXT_PUBLIC_SITE_URL', { infer: true }).replace(/\/+$/, '')
    const event = {
      ...buildServerEvent({
        kind: 'purchase',
        order: { orderNumber: 'TEST', total: 1, items: [] },
        customer: { email: admin.email, phone: '', fullName: '', city: '', postalCode: null },
        browser: {
          clientIp: ip,
          userAgent,
          fbp: null,
          fbc: null,
          sourceUrl: `${siteUrl}/checkout`,
        },
        at: new Date(),
      }),
      event_id: `test-${randomUUID()}`,
    }
    const answer = await this.meta.send(s.meta_pixel_id, [event], testEventCode)
    await this.prisma.metaEvent.create({
      data: {
        eventName: event.event_name,
        eventId: event.event_id,
        status: answer.ok ? 'SENT' : 'FAILED',
        test: true,
        eventsReceived: answer.ok ? answer.eventsReceived : null,
        message: answer.ok ? answer.messages.join(' · ') || null : answer.message,
        fbtraceId: answer.fbtraceId,
      },
    })
    return answer.ok
      ? { ok: true, eventsReceived: answer.eventsReceived, messages: answer.messages }
      : { ok: false, message: answer.message, tokenProblem: answer.tokenProblem }
  }

  /** The newest 100 log lines (no customer details are stored in it). */
  async log() {
    return this.prisma.metaEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: LOG_SIZE,
      select: {
        id: true,
        orderNumber: true,
        eventName: true,
        status: true,
        test: true,
        eventsReceived: true,
        message: true,
        fbtraceId: true,
        createdAt: true,
      },
    })
  }
}
