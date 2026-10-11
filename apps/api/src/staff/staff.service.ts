import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma, type StaffChangeAction, type UserRole } from '@nowoll/database'
import { AUTH_PROVIDER, type AuthProvider } from '../auth/auth-provider.js'
import { PrismaService } from '../prisma/prisma.service.js'

export type StaffRole = 'ADMIN' | 'STAFF'

export interface AdminStaffMember {
  id: string
  email: string
  fullName: string | null
  role: StaffRole
  twoFactor: boolean | null
  isYou: boolean
  accountCreatedAt: Date
}

export interface StaffChangeView {
  id: string
  action: StaffChangeAction
  fromRole: UserRole | null
  toRole: UserRole | null
  createdAt: Date
  actor: { fullName: string | null; email: string } | null
  target: { fullName: string | null; email: string }
}

export interface AdminStaffPage {
  members: AdminStaffMember[]
  changes: StaffChangeView[]
}

const STAFF_ROLES: UserRole[] = ['ADMIN', 'STAFF']

/**
 * Admin → Staff (step 38e). The rules that keep the shop from being locked
 * out — and every change written to the staff change log:
 *   • only existing shop accounts (they chose their own password — no admin
 *     ever handles someone else's password); never banned or deleted ones
 *   • you can't change or remove your OWN access, or reset your own 2FA
 *     (a stolen session must not replace your authenticator)
 *   • there is always at least one ADMIN
 *   • 2FA can never be switched off — a reset just makes them set it up again
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_PROVIDER) private readonly auth: AuthProvider,
  ) {}

  /** GET /admin/staff */
  async page(youId: string | null): Promise<AdminStaffPage> {
    const [users, changes] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { in: STAFF_ROLES }, deletedAt: null },
        // Admins first (the enum order is CUSTOMER, STAFF, ADMIN), then oldest first.
        orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, email: true, fullName: true, role: true, createdAt: true },
      }),
      this.prisma.staffChange.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          actor: { select: { fullName: true, email: true } },
          target: { select: { fullName: true, email: true } },
        },
      }),
    ])
    // Supabase is asked once per staff member — a handful of people.
    const twoFactor = await Promise.all(users.map((u) => this.auth.hasVerifiedTotp(u.id)))
    return {
      members: users.map((u, i) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role as StaffRole,
        twoFactor: twoFactor[i] ?? null,
        isYou: u.id === youId,
        accountCreatedAt: u.createdAt,
      })),
      changes: changes.map((c) => ({
        id: c.id,
        action: c.action,
        fromRole: c.fromRole,
        toRole: c.toRole,
        createdAt: c.createdAt,
        actor: c.actor,
        target: c.target,
      })),
    }
  }

  /** POST /admin/staff — give an existing shop account admin access. */
  async grant(email: string, role: StaffRole, actorId: string | null): Promise<{ id: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!user || user.deletedAt)
      throw new NotFoundException({
        code: 'NO_ACCOUNT',
        message:
          'There’s no shop account with this email. Ask them to sign up on the shop first (with this email), then add them here.',
      })
    if (user.status === 'BANNED')
      throw new ConflictException({
        code: 'ACCOUNT_BANNED',
        message: 'This account is banned — unban it in Customers first.',
      })
    if (user.role !== 'CUSTOMER')
      throw new ConflictException({
        code: 'ALREADY_STAFF',
        message: `This account already has admin access (${user.role === 'ADMIN' ? 'Admin' : 'Staff'}).`,
      })
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { role } }),
      this.prisma.staffChange.create({
        data: { actorId, targetId: user.id, action: 'GRANTED', fromRole: 'CUSTOMER', toRole: role },
      }),
    ])
    return { id: user.id }
  }

  /** PATCH /admin/staff/:id — Admin ⇄ Staff. */
  async changeRole(id: string, role: StaffRole, actorId: string | null): Promise<{ id: string }> {
    const user = await this.member(id, actorId, 'change your own role')
    if (user.role === role) return { id }
    return this.serializable(async (tx) => {
      if (user.role === 'ADMIN') await this.keepOneAdmin(tx, id)
      await tx.user.update({ where: { id }, data: { role } })
      await tx.staffChange.create({
        data: { actorId, targetId: id, action: 'ROLE_CHANGED', fromRole: user.role, toRole: role },
      })
      return { id }
    })
  }

  /** DELETE /admin/staff/:id — back to a customer account (soft: account and orders stay). */
  async revoke(id: string, actorId: string | null): Promise<{ id: string }> {
    const user = await this.member(id, actorId, 'remove your own access')
    return this.serializable(async (tx) => {
      if (user.role === 'ADMIN') await this.keepOneAdmin(tx, id)
      await tx.user.update({ where: { id }, data: { role: 'CUSTOMER' } })
      await tx.staffChange.create({
        data: { actorId, targetId: id, action: 'REVOKED', fromRole: user.role, toRole: 'CUSTOMER' },
      })
      return { id }
    })
  }

  /** POST /admin/staff/:id/reset-2fa — lost phone: remove their app; next sign-in sets up a new one. */
  async resetTwoFactor(id: string, actorId: string | null): Promise<{ id: string }> {
    await this.member(
      id,
      actorId,
      'reset your own authenticator app here (use pnpm admin:reset-2fa)',
    )
    if (!(await this.auth.removeTotp(id)))
      throw new ServiceUnavailableException({
        code: 'AUTH_UNAVAILABLE',
        message: 'The sign-in service didn’t answer. Nothing changed — please try again.',
      })
    await this.prisma.staffChange.create({
      data: { actorId, targetId: id, action: 'TWO_FACTOR_RESET' },
    })
    return { id }
  }

  /** A current staff member, not yourself. */
  private async member(id: string, actorId: string | null, what: string) {
    if (id === actorId)
      throw new BadRequestException({ code: 'NOT_YOURSELF', message: `You can’t ${what}.` })
    const user = await this.prisma.user.findFirst({
      where: { id, role: { in: STAFF_ROLES }, deletedAt: null },
    })
    if (!user) throw new NotFoundException('Staff member not found')
    return user
  }

  /**
   * SERIALIZABLE transaction: if two admins demote each other at the same
   * moment, Postgres lets only one finish — so "always one admin" can't be
   * beaten by timing. The other gets "try again" and then sees the new state.
   */
  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (isWriteConflict(error))
        throw new ConflictException({
          code: 'STAFF_CHANGED',
          message: 'Someone changed staff at the same moment. Reload the page and try again.',
        })
      throw error
    }
  }

  /** Refuses to leave the shop without an ADMIN (checked inside the change's transaction). */
  protected async keepOneAdmin(tx: Prisma.TransactionClient, leavingId: string): Promise<void> {
    const others = await tx.user.count({
      where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE', id: { not: leavingId } },
    })
    if (others === 0)
      throw new ConflictException({
        code: 'LAST_ADMIN',
        message:
          'This is the only admin. Make someone else an admin first, so the shop always has one.',
      })
  }
}

/**
 * "These two transactions clashed — one must try again." With our database
 * driver (Prisma's pg adapter) it arrives as a DriverAdapterError whose cause
 * is { kind: 'TransactionWriteConflict' } (@prisma/driver-adapter-utils);
 * Prisma's own engine reports it as P2034. Both are handled.
 */
function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2034'
  return (
    error instanceof Error &&
    error.name === 'DriverAdapterError' &&
    (error as { cause?: { kind?: string } }).cause?.kind === 'TransactionWriteConflict'
  )
}
