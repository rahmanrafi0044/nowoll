import { randomBytes } from 'node:crypto'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Prisma } from '@nowoll/database'
import { SubscriberStatus } from '@nowoll/database/enums'
import type { AdminSubscribersPage, NewsletterSyncStatus } from '@nowoll/types'
import { stringify } from 'csv-stringify/sync'
import type { EnvironmentVariables } from '../config/env.validation.js'
import { SettingsService } from '../settings/settings.service.js'
import { CUSTOMER_NOTIFIER, type CustomerNotifier } from '../notifications/customer-notifier.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { SubscribeDto } from './dto/subscribe.dto.js'

export const SUBSCRIBE_MESSAGE = "Thanks — we'll confirm by email soon."

@Injectable()
export class SubscribersService {
  private readonly logger = new Logger(SubscribersService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CUSTOMER_NOTIFIER) private readonly notifier: CustomerNotifier,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * POST /subscribers — DOUBLE OPT-IN, step 1 (approved decision #2).
   * The email is stored as PENDING with a secret token, and the confirmation
   * email is queued (step 28). Only confirmed (SUBSCRIBED) people get
   * newsletters. Signing up again while PENDING sends NOTHING new — so
   * nobody can use the form to flood someone's inbox.
   *
   * The answer is IDENTICAL whether the email is new, pending or already
   * subscribed — otherwise anyone could use this form to discover which
   * email addresses are customers of Nowoll ("account enumeration").
   */
  async subscribe(dto: SubscribeDto): Promise<{ message: string }> {
    const existing = await this.prisma.subscriber.findUnique({ where: { email: dto.email } })

    if (!existing) {
      const created = await this.prisma.subscriber.create({
        data: { email: dto.email, source: dto.source ?? null, confirmToken: newToken() },
      })
      await this.askToConfirm(created.id, created.confirmToken!)
    } else if (existing.status === SubscriberStatus.UNSUBSCRIBED) {
      // They unsubscribed before and are signing up again → confirm again (new token → new email).
      const updated = await this.prisma.subscriber.update({
        where: { id: existing.id },
        data: { status: SubscriberStatus.PENDING, confirmToken: newToken(), unsubscribedAt: null },
      })
      await this.askToConfirm(updated.id, updated.confirmToken!)
    }
    // PENDING or SUBSCRIBED already: nothing to do — same answer as above.

    return { message: SUBSCRIBE_MESSAGE }
  }

  /**
   * POST /subscribers/confirm — the button on /newsletter/confirm (step 28).
   * Clicking twice is fine. (A link that is merely OPENED does nothing: some
   * email scanners open every link — that's why the page has a button.)
   */
  async confirm(token: string): Promise<{ status: 'SUBSCRIBED' }> {
    const s = await this.byToken(token)
    if (s.status !== SubscriberStatus.SUBSCRIBED) {
      await this.prisma.subscriber.update({
        where: { id: s.id },
        data: {
          status: SubscriberStatus.SUBSCRIBED,
          confirmedAt: new Date(),
          unsubscribedAt: null,
        },
      })
      await this.syncToResend(s.id) // step 42: into the newsletter segment
    }
    return { status: 'SUBSCRIBED' }
  }

  /**
   * POST /subscribers/unsubscribe — the button on /newsletter/unsubscribe.
   * The same secret token as the confirmation link (it stays valid, so every
   * future newsletter can carry it). Clicking twice is fine.
   */
  async unsubscribe(token: string): Promise<{ status: 'UNSUBSCRIBED' }> {
    const s = await this.byToken(token)
    if (s.status !== SubscriberStatus.UNSUBSCRIBED) await this.markUnsubscribed(s.id)
    return { status: 'UNSUBSCRIBED' }
  }

  // ── Admin → Newsletter (step 42) ────────────────────────────────────────

  /** The list: counts, a status filter, search by email, newest first. */
  async adminPage(q: {
    status?: SubscriberStatus
    q?: string
    page: number
    pageSize: number
  }): Promise<AdminSubscribersPage> {
    const where: Prisma.SubscriberWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.q && { email: { contains: q.q.trim().toLowerCase() } }),
    }
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000)
    const [byStatus, newLast30Days, total, items] = await Promise.all([
      this.prisma.subscriber.groupBy({ by: ['status'], _count: true }),
      this.prisma.subscriber.count({
        where: { status: SubscriberStatus.SUBSCRIBED, confirmedAt: { gte: monthAgo } },
      }),
      this.prisma.subscriber.count({ where }),
      this.prisma.subscriber.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          email: true,
          status: true,
          source: true,
          createdAt: true,
          confirmedAt: true,
          unsubscribedAt: true,
          resendSyncedAt: true,
          resendError: true,
        },
      }),
    ])
    const count = (st: SubscriberStatus) => byStatus.find((r) => r.status === st)?._count ?? 0
    return {
      counts: {
        subscribed: count(SubscriberStatus.SUBSCRIBED),
        pending: count(SubscriberStatus.PENDING),
        unsubscribed: count(SubscriberStatus.UNSUBSCRIBED),
        newLast30Days,
      },
      items: items.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        confirmedAt: i.confirmedAt?.toISOString() ?? null,
        unsubscribedAt: i.unsubscribedAt?.toISOString() ?? null,
        resendSyncedAt: i.resendSyncedAt?.toISOString() ?? null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    }
  }

  /** Confirmed subscribers as CSV (spreadsheet formulas neutralised). */
  async exportCsv(): Promise<Buffer> {
    const rows = await this.prisma.subscriber.findMany({
      where: { status: SubscriberStatus.SUBSCRIBED },
      orderBy: { confirmedAt: 'asc' },
      select: { email: true, confirmedAt: true, source: true },
    })
    return Buffer.from(
      stringify(
        rows.map((r) => ({
          email: r.email,
          confirmed_on: r.confirmedAt?.toISOString().slice(0, 10) ?? '',
          source: r.source ?? '',
        })),
        {
          header: true,
          columns: ['email', 'confirmed_on', 'source'],
          escape_formulas: true, // CSV injection: a cell starting with = + - @ is shown as text
          bom: true, // Excel opens it as UTF-8
        },
      ),
    )
  }

  /** Unsubscribe someone (e.g. they asked by phone). */
  async adminUnsubscribe(id: string): Promise<{ status: 'UNSUBSCRIBED' }> {
    const s = await this.prisma.subscriber.findUnique({ where: { id } })
    if (!s) throw new NotFoundException('Not on the newsletter list')
    if (s.status !== SubscriberStatus.UNSUBSCRIBED) await this.markUnsubscribed(s.id)
    return { status: 'UNSUBSCRIBED' }
  }

  /**
   * ERASE someone (PDPO 2025: a request to delete their data). The one place
   * we hard-delete instead of soft-deleting — keeping the email would defeat
   * the request. Resend's copy is erased by the worker.
   */
  async erase(id: string): Promise<{ deleted: true }> {
    const s = await this.prisma.subscriber.findUnique({ where: { id } })
    if (!s) throw new NotFoundException('Not on the newsletter list')
    await this.prisma.subscriber.delete({ where: { id } })
    await this.notifier
      .newsletterErase(s.email)
      .catch((e: unknown) => this.logger.error(`Newsletter erase job failed: ${String(e)}`))
    return { deleted: true }
  }

  /** The Resend copy at a glance (never the key or the webhook secret). */
  async syncStatus(): Promise<NewsletterSyncStatus> {
    const s = await this.settings.all()
    const subscribed = { status: SubscriberStatus.SUBSCRIBED }
    const [synced, failed, lastFailed] = await Promise.all([
      this.prisma.subscriber.count({
        where: { ...subscribed, resendSyncedAt: { not: null }, resendError: null },
      }),
      this.prisma.subscriber.count({ where: { resendError: { not: null } } }),
      this.prisma.subscriber.findFirst({
        where: { resendError: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { resendError: true },
      }),
    ])
    const total = await this.prisma.subscriber.count({ where: subscribed })
    return {
      enabled: s.newsletter_resend_enabled,
      segmentSet: s.newsletter_resend_segment_id !== '',
      webhookSet: !!this.config.get('RESEND_WEBHOOK_SECRET', { infer: true }),
      synced,
      waiting: Math.max(total - synced, 0),
      failed,
      lastError: lastFailed?.resendError ?? null,
    }
  }

  async syncAll(): Promise<{ queued: true }> {
    await this.notifier.newsletterSyncAll()
    return { queued: true }
  }

  /**
   * Resend's webhook said this contact unsubscribed (they clicked the link in
   * a Broadcast). Only ever UNSUBSCRIBES — subscribing takes our double opt-in.
   * A late webhook from before a newer confirmation is ignored.
   */
  async unsubscribedInResend(email: string, at: Date): Promise<'unsubscribed' | 'ignored'> {
    const s = await this.prisma.subscriber.findUnique({ where: { email: email.toLowerCase() } })
    if (!s || s.status === SubscriberStatus.UNSUBSCRIBED) return 'ignored'
    if (s.confirmedAt && s.confirmedAt > at) return 'ignored'
    const now = new Date()
    await this.prisma.subscriber.update({
      where: { id: s.id },
      // Resend already knows — so it's "synced", nothing to send back.
      data: {
        status: SubscriberStatus.UNSUBSCRIBED,
        unsubscribedAt: now,
        resendSyncedAt: now,
        resendError: null,
      },
    })
    return 'unsubscribed'
  }

  private async markUnsubscribed(id: string) {
    await this.prisma.subscriber.update({
      where: { id },
      data: { status: SubscriberStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
    })
    await this.syncToResend(id)
  }

  /** Step 42: tell the worker (it checks whether copying to Resend is on). */
  private async syncToResend(id: string) {
    await this.notifier
      .newsletterSync(id)
      .catch((e: unknown) => this.logger.error(`Newsletter sync job failed: ${String(e)}`))
  }

  private async byToken(token: string) {
    const s = await this.prisma.subscriber.findUnique({ where: { confirmToken: token } })
    if (!s)
      throw new NotFoundException({
        message: 'This link is no longer valid. You can sign up again from the newsletter form.',
        code: 'LINK_INVALID',
      })
    return s
  }

  private async askToConfirm(subscriberId: string, token: string) {
    await this.notifier
      .newsletterSignup(subscriberId, token)
      .catch((e: unknown) => this.logger.error(`Newsletter notification failed: ${String(e)}`))
  }
}

/** 256-bit random token for the confirm/unsubscribe links — unguessable. */
const newToken = () => randomBytes(32).toString('hex')
