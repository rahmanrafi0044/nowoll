import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { UserRole, UserStatus } from '@nowoll/database/enums'
import type { AdminCustomerDetail, AdminCustomerList } from '@nowoll/types'
import { SALE_STATUSES } from '../analytics/analytics.service.js'
import { toOrderRow } from '../orders/admin-orders.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AdminCustomersQuery } from './dto/admin-customers.dto.js'

// ============================================================================
// Customer accounts in the admin panel (step 32). Staff accounts are not
// customers: they are never listed or banned here (pnpm admin:revoke).
//
// BANNING: the account is refused on its next request (AuthService already
// refuses BANNED accounts), and checkout refuses guest orders with its email
// or phone (OrdersService). Open orders are left alone — staff decide.
// ============================================================================

const ORDER_ROW = { include: { _count: { select: { items: true } } } } as const

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/customers */
  async list(query: AdminCustomersQuery): Promise<AdminCustomerList> {
    const { page, pageSize } = query
    const where = whereSql(query)
    const [counted] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM users u WHERE ${where}`
    // One query: each account with its order count, money spent (sales only)
    // and last order — so the list can be SORTED by them, page by page.
    const rows = await this.prisma.$queryRaw<
      {
        id: string
        name: string | null
        email: string
        phone: string | null
        status: 'ACTIVE' | 'BANNED'
        joinedAt: Date
        orderCount: number
        totalSpent: string
        lastOrderAt: Date | null
      }[]
    >`
      SELECT u.id::text AS id, u.full_name AS name, u.email, u.phone,
             u.status::text AS status, u.created_at AS "joinedAt",
             COUNT(o.id)::int AS "orderCount",
             COALESCE(SUM(o.total) FILTER (WHERE o.status::text = ANY(${SALE_STATUSES})), 0)::text AS "totalSpent",
             MAX(o.created_at) AS "lastOrderAt"
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE ${where}
      GROUP BY u.id
      ORDER BY ${ORDER_SQL[query.sort]}, u.id
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
    return {
      items: rows.map((r) => ({
        ...r,
        totalSpent: new Prisma.Decimal(r.totalSpent).toString(),
        joinedAt: r.joinedAt.toISOString(),
        lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
      })),
      total: counted?.total ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((counted?.total ?? 0) / pageSize),
    }
  }

  /** GET /admin/customers/:id */
  async detail(id: string): Promise<AdminCustomerDetail> {
    const u = await this.findCustomer(id, {
      addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
      bannedBy: { select: { fullName: true, email: true } },
      _count: { select: { reviews: true, returnRequests: true } },
    })
    const [orders, sales, guestOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId: id },
        ...ORDER_ROW,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.order.aggregate({
        where: { userId: id, status: { in: SALE_STATUSES } },
        _sum: { total: true },
        _count: true,
      }),
      // Staff-only: guest orders with the same email or phone (no account linked).
      this.prisma.order.findMany({
        where: {
          userId: null,
          OR: [
            { email: { equals: u.email, mode: 'insensitive' } },
            ...(u.phone ? [{ phone: u.phone }] : []),
          ],
        },
        ...ORDER_ROW,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 50,
      }),
    ])
    const spent = sales._sum.total ?? new Prisma.Decimal(0)
    return {
      id: u.id,
      name: u.fullName,
      email: u.email,
      phone: u.phone,
      status: u.status,
      joinedAt: u.createdAt.toISOString(),
      ban:
        u.status === UserStatus.BANNED
          ? {
              reason: u.bannedReason ?? '',
              at: u.bannedAt?.toISOString() ?? null,
              by: u.bannedBy ? (u.bannedBy.fullName ?? u.bannedBy.email) : null,
            }
          : null,
      stats: {
        orderCount: orders.length,
        totalSpent: spent.toString(),
        averageOrder:
          sales._count === 0 ? '0' : spent.dividedBy(sales._count).toDecimalPlaces(2).toString(),
        firstOrderAt: orders.at(-1)?.createdAt.toISOString() ?? null,
        lastOrderAt: orders[0]?.createdAt.toISOString() ?? null,
        reviewCount: u._count.reviews,
        returnCount: u._count.returnRequests,
      },
      addresses: u.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        fullName: a.fullName,
        phone: a.phone,
        line1: a.addressLine1,
        line2: a.addressLine2,
        area: a.area,
        district: a.district,
        division: a.division,
        isDefault: a.isDefault,
      })),
      orders: orders.map(toOrderRow),
      guestOrders: guestOrders.map(toOrderRow),
    }
  }

  /** PATCH /admin/customers/:id/ban — refused from the next request on. */
  async ban(id: string, reason: string, actorId: string | null): Promise<AdminCustomerDetail> {
    const u = await this.findCustomer(id)
    if (u.status === UserStatus.BANNED)
      throw new ConflictException({
        message: 'This account is already banned.',
        code: 'ALREADY_BANNED',
      })
    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.BANNED,
        bannedReason: reason,
        bannedAt: new Date(),
        bannedById: actorId,
      },
    })
    return this.detail(id)
  }

  /** PATCH /admin/customers/:id/unban */
  async unban(id: string): Promise<AdminCustomerDetail> {
    const u = await this.findCustomer(id)
    if (u.status !== UserStatus.BANNED)
      throw new ConflictException({ message: 'This account isn’t banned.', code: 'NOT_BANNED' })
    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE, bannedReason: null, bannedAt: null, bannedById: null },
    })
    return this.detail(id)
  }

  /** A customer account (not staff, not deleted) — or 404, like a missing one. */
  private async findCustomer<I extends Prisma.UserInclude>(id: string, include?: I) {
    const u = await this.prisma.user.findFirst({
      where: { id, role: UserRole.CUSTOMER, deletedAt: null },
      include: include as I,
    })
    if (!u) throw new NotFoundException('Customer not found')
    return u as Prisma.UserGetPayload<{ include: I }>
  }
}

function whereSql(query: AdminCustomersQuery): Prisma.Sql {
  const parts = [Prisma.sql`u.role = 'CUSTOMER' AND u.deleted_at IS NULL`]
  if (query.status) parts.push(Prisma.sql`u.status::text = ${query.status}`)
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    // Phones are stored as +8801712345678; people type 01712345678 or 1712-345678.
    const digits = query.q.replace(/\D/g, '').replace(/^(880|0)/, '')
    parts.push(
      digits.length >= 4
        ? Prisma.sql`(u.full_name ILIKE ${like} OR u.email ILIKE ${like} OR u.phone LIKE ${`%${digits}%`})`
        : Prisma.sql`(u.full_name ILIKE ${like} OR u.email ILIKE ${like})`,
    )
  }
  return Prisma.join(parts, ' AND ')
}

// Fixed SQL per sort option (never built from user input).
const ORDER_SQL: Record<AdminCustomersQuery['sort'], Prisma.Sql> = {
  newest: Prisma.sql`u.created_at DESC`,
  spent: Prisma.sql`SUM(o.total) FILTER (WHERE o.status::text = ANY(${SALE_STATUSES})) DESC NULLS LAST`,
  orders: Prisma.sql`COUNT(o.id) DESC`,
  name: Prisma.sql`LOWER(COALESCE(u.full_name, u.email)) ASC`,
}
