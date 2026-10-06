import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@nowoll/database'
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@nowoll/database/enums'
import type { Paginated } from '@nowoll/types'
import { bdPhoneSchema, emailSchema } from '@nowoll/validation'
import { PaymentsService } from '../payments/payments.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { TrackOrderDto } from './dto/track-order.dto.js'
import { displayNumber } from './order-number.js'

// ============================================================================
// Reading an order back AFTER checkout, without an account (step 21).
//
// Two views, two levels of trust:
//   receipt(id)  — the confirmation page. The order's id is a long random
//                  UUID that only the customer's browser received, so having
//                  it proves they placed the order → the full receipt.
//   track(...)   — the public "Track your order" form. Order numbers count up
//                  (10001, 10002…), so the email/phone is the real lock — and
//                  the answer is deliberately smaller: no street address, so
//                  knowing someone's email never reveals where they live.
// Neither view ever includes admin notes, history notes or cancel reasons.
// ============================================================================

export interface OrderLine {
  /** null if the product was deleted since (the order keeps its copy of the name). */
  productId: string | null
  productName: string
  variantLabel: string
  imageUrl: string | null
  unitPrice: Prisma.Decimal
  quantity: number
  lineTotal: Prisma.Decimal
}

interface OrderBasics {
  displayNumber: string
  placedAt: Date
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  items: OrderLine[]
  total: Prisma.Decimal
  /** True while "Pay now" can still work (online, unpaid, within the payment window). */
  canPay: boolean
}

export interface OrderReceipt extends OrderBasics {
  orderId: string
  customerName: string
  deliveryAddress: {
    addressLine1: string
    addressLine2: string | null
    area: string | null
    district: string
    division: string
    postalCode: string | null
  }
  deliveryZone: string
  totals: {
    subtotal: Prisma.Decimal
    discount: Prisma.Decimal
    discountCode: string | null
    shippingFee: Prisma.Decimal
    vatRate: Prisma.Decimal
    vatAmount: Prisma.Decimal
    total: Prisma.Decimal
  }
}

/** One row of "My orders" (step 23). */
export interface AccountOrderSummary {
  displayNumber: string
  placedAt: Date
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  total: Prisma.Decimal
  itemCount: number
  /** Up to 3 item photos for the list. */
  imageUrls: string[]
}

/** "My orders" → one order: the full receipt plus delivery progress. */
export interface AccountOrderDetail extends OrderReceipt {
  courierName: string | null
  trackingNumber: string | null
  timeline: { status: OrderStatus; at: Date }[]
}

export interface OrderTracking extends OrderBasics {
  /** Only while "Pay now" can work — "Pay now" needs it. Null otherwise. */
  payOrderId: string | null
  deliveryArea: { area: string | null; district: string; division: string }
  courierName: string | null
  trackingNumber: string | null
  /** When the order first reached each status, oldest first (no notes). */
  timeline: { status: OrderStatus; at: Date }[]
}

/** The same answer for every miss — nobody can tell whether an order number exists. */
const NOT_FOUND =
  "We couldn't find an order with those details. Check the order number and the email or mobile number you used."

/** "NW-10001" / "nw 10001" / "10001" → 10001; null if it isn't an order number. */
export function parseOrderNumber(input: string): number | null {
  const m = /^(?:nw)?[\s-]*(\d{1,9})$/i.exec(input.trim())
  return m ? Number(m[1]) : null
}

/** An email (lower-cased) or a mobile number (+880 format), the same rules as checkout. */
export function parseContact(input: string): { email: string } | { phone: string } | null {
  if (input.includes('@')) {
    const email = emailSchema.safeParse(input)
    return email.success ? { email: email.data } : null
  }
  const phone = bdPhoneSchema.safeParse(input)
  return phone.success ? { phone: phone.data } : null
}

const include = {
  items: { orderBy: { createdAt: 'asc' } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude

type FullOrder = Prisma.OrderGetPayload<{ include: typeof include }>

@Injectable()
export class OrderLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  /** GET /orders/:id/receipt */
  async receipt(orderId: string): Promise<OrderReceipt> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include })
    if (!order) throw new NotFoundException('Order not found')
    return this.toReceipt(order)
  }

  /**
   * GET /orders/my — the signed-in customer's orders, newest first. Only
   * orders placed WHILE signed in (step 22 decision #3: never guest orders
   * that merely share the email).
   */
  async myOrders(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<AccountOrderSummary>> {
    const where = { userId }
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' }, // uses the (user_id, created_at) index
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: { orderBy: { createdAt: 'asc' }, select: { quantity: true, imageUrl: true } },
        },
      }),
    ])
    return {
      items: orders.map((o) => ({
        displayNumber: displayNumber(o.orderNumber),
        placedAt: o.createdAt,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        total: o.total,
        itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
        imageUrls: o.items.flatMap((i) => (i.imageUrl ? [i.imageUrl] : [])).slice(0, 3),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  /**
   * GET /orders/my/:number — one of MY orders. Someone else's order is a 404,
   * exactly like a missing one: nobody can probe which order numbers exist.
   */
  async myOrder(userId: string, number: string): Promise<AccountOrderDetail> {
    const orderNumber = parseOrderNumber(number)
    const order =
      orderNumber === null
        ? null
        : await this.prisma.order.findFirst({ where: { orderNumber, userId }, include })
    if (!order) throw new NotFoundException('Order not found')
    return {
      ...(await this.toReceipt(order)),
      courierName: order.courierName,
      trackingNumber: order.trackingNumber,
      timeline: timelineOf(order),
    }
  }

  private async toReceipt(order: FullOrder): Promise<OrderReceipt> {
    return {
      orderId: order.id,
      ...(await this.basics(order)),
      customerName: order.customerName,
      deliveryAddress: {
        addressLine1: order.shippingAddressLine1,
        addressLine2: order.shippingAddressLine2,
        area: order.shippingArea,
        district: order.shippingDistrict,
        division: order.shippingDivision,
        postalCode: order.shippingPostalCode,
      },
      deliveryZone: order.shippingZoneName,
      totals: {
        subtotal: order.subtotal,
        discount: order.discountAmount,
        discountCode: order.discountCode,
        shippingFee: order.shippingFee,
        vatRate: order.vatRate,
        vatAmount: order.vatAmount,
        total: order.total,
      },
    }
  }

  /** POST /orders/track */
  async track(dto: TrackOrderDto): Promise<OrderTracking> {
    const orderNumber = parseOrderNumber(dto.orderNumber)
    if (orderNumber === null)
      throw new BadRequestException(
        'Enter your order number as it appears on your receipt, e.g. NW-10001.',
      )
    const contact = parseContact(dto.contact)
    if (!contact)
      throw new BadRequestException('Enter a valid email address or Bangladeshi mobile number.')

    // ONE query matching number AND contact: a wrong email and a missing order
    // look exactly the same from outside (same answer, same work).
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, ...contact },
      include,
    })
    if (!order) throw new NotFoundException(NOT_FOUND)

    const basics = await this.basics(order)
    return {
      ...basics,
      payOrderId: basics.canPay ? order.id : null,
      deliveryArea: {
        area: order.shippingArea,
        district: order.shippingDistrict,
        division: order.shippingDivision,
      },
      courierName: order.courierName,
      trackingNumber: order.trackingNumber,
      timeline: timelineOf(order),
    }
  }

  private async basics(order: FullOrder): Promise<OrderBasics> {
    return {
      displayNumber: displayNumber(order.orderNumber),
      placedAt: order.createdAt,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      items: order.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        variantLabel: i.variantLabel,
        imageUrl: i.imageUrl,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
      })),
      total: order.total,
      canPay: await this.payments.canPayNow(order),
    }
  }
}

/** When the order FIRST reached each status, oldest first — no notes (they're for staff). */
function timelineOf(order: FullOrder): { status: OrderStatus; at: Date }[] {
  const firstTimes = new Map<OrderStatus, Date>()
  for (const h of order.statusHistory)
    if (!firstTimes.has(h.toStatus)) firstTimes.set(h.toStatus, h.createdAt)
  return [...firstTimes].map(([status, at]) => ({ status, at }))
}
