import { randomBytes } from 'node:crypto'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { SubscriberStatus } from '@nowoll/database/enums'
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
    if (s.status !== SubscriberStatus.SUBSCRIBED)
      await this.prisma.subscriber.update({
        where: { id: s.id },
        data: {
          status: SubscriberStatus.SUBSCRIBED,
          confirmedAt: new Date(),
          unsubscribedAt: null,
        },
      })
    return { status: 'SUBSCRIBED' }
  }

  /**
   * POST /subscribers/unsubscribe — the button on /newsletter/unsubscribe.
   * The same secret token as the confirmation link (it stays valid, so every
   * future newsletter can carry it). Clicking twice is fine.
   */
  async unsubscribe(token: string): Promise<{ status: 'UNSUBSCRIBED' }> {
    const s = await this.byToken(token)
    if (s.status !== SubscriberStatus.UNSUBSCRIBED)
      await this.prisma.subscriber.update({
        where: { id: s.id },
        data: { status: SubscriberStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
      })
    return { status: 'UNSUBSCRIBED' }
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
