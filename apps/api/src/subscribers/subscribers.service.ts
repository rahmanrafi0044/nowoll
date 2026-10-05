import { randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { SubscriberStatus } from '@nowoll/database/enums'
import { PrismaService } from '../prisma/prisma.service.js'
import type { SubscribeDto } from './dto/subscribe.dto.js'

export const SUBSCRIBE_MESSAGE = "Thanks — we'll confirm by email soon."

@Injectable()
export class SubscribersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /subscribers — DOUBLE OPT-IN, step 1 (approved decision #2).
   * The email is stored as PENDING with a secret confirmation token. Nothing
   * is sent yet: Phase 4/6 emails a confirmation link to every PENDING
   * subscriber, and only confirmed (SUBSCRIBED) people get newsletters.
   *
   * The answer is IDENTICAL whether the email is new, pending or already
   * subscribed — otherwise anyone could use this form to discover which
   * email addresses are customers of Nowoll ("account enumeration").
   */
  async subscribe(dto: SubscribeDto): Promise<{ message: string }> {
    const existing = await this.prisma.subscriber.findUnique({ where: { email: dto.email } })

    if (!existing) {
      await this.prisma.subscriber.create({
        data: { email: dto.email, source: dto.source ?? null, confirmToken: newToken() },
      })
    } else if (existing.status === SubscriberStatus.UNSUBSCRIBED) {
      // They unsubscribed before and are signing up again → confirm again.
      await this.prisma.subscriber.update({
        where: { id: existing.id },
        data: { status: SubscriberStatus.PENDING, confirmToken: newToken(), unsubscribedAt: null },
      })
    }
    // PENDING or SUBSCRIBED already: nothing to do — same answer as above.

    return { message: SUBSCRIBE_MESSAGE }
  }
}

/** 256-bit random token for the future confirmation link — unguessable. */
const newToken = () => randomBytes(32).toString('hex')
