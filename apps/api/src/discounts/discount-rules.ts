import { Prisma } from '@nowoll/database'
import { DiscountType } from '@nowoll/database/enums'

// ============================================================================
// Discount rules as pure functions (no database) — the heart of this module,
// and the easiest part to test exhaustively. All money maths uses Decimal,
// never JavaScript numbers, so ৳0.10 + ৳0.20 is exactly ৳0.30.
// ============================================================================

const ZERO = new Prisma.Decimal(0)

/** "  summer10 " → "SUMMER10". Codes are stored and compared in upper case. */
export const normalizeCode = (code: string) => code.trim().toUpperCase()

export interface DiscountRules {
  type: DiscountType
  value: Prisma.Decimal
  minOrderAmount: Prisma.Decimal | null
  maxDiscountAmount: Prisma.Decimal | null
  usageLimit: number | null
  usedCount: number
  startsAt: Date | null
  expiresAt: Date | null
  isActive: boolean
  deletedAt: Date | null
}

export type DiscountRefusal =
  | { code: 'DISCOUNT_NOT_VALID'; message: string }
  | { code: 'DISCOUNT_EXPIRED'; message: string }
  | { code: 'DISCOUNT_USED_UP'; message: string }
  | { code: 'DISCOUNT_MIN_ORDER'; message: string; shortBy: Prisma.Decimal }
  | { code: 'DISCOUNT_CUSTOMER_LIMIT'; message: string }

/** "৳1,490" style text for messages (whole taka, lakh grouping). */
export const taka = (d: Prisma.Decimal) =>
  `৳${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(d.toNumber())}`

/**
 * Can this code be used on a subtotal right now? Returns null if yes,
 * otherwise why not (decision #5: unknown, inactive and not-yet-started codes
 * all give the SAME answer, so upcoming promotions can't be discovered by guessing).
 */
export function refusalFor(
  rules: DiscountRules | null,
  subtotal: Prisma.Decimal,
  now: Date,
): DiscountRefusal | null {
  const notValid = { code: 'DISCOUNT_NOT_VALID', message: "This code isn't valid." } as const
  if (!rules || !rules.isActive || rules.deletedAt) return notValid
  if (rules.startsAt && now < rules.startsAt) return notValid
  if (rules.expiresAt && now >= rules.expiresAt)
    return { code: 'DISCOUNT_EXPIRED', message: 'This code has expired.' }
  if (rules.usageLimit !== null && rules.usedCount >= rules.usageLimit) {
    return { code: 'DISCOUNT_USED_UP', message: 'This code has been fully used.' }
  }
  if (rules.minOrderAmount && subtotal.lessThan(rules.minOrderAmount)) {
    const shortBy = rules.minOrderAmount.minus(subtotal)
    return {
      code: 'DISCOUNT_MIN_ORDER',
      message: `Add ${taka(shortBy)} more to use this code (minimum order ${taka(rules.minOrderAmount)}).`,
      shortBy,
    }
  }
  return null
}

/**
 * How much the code takes off the PRODUCT subtotal (decision #1: shipping is
 * never discounted; VAT is calculated afterwards on the reduced amount).
 *   PERCENTAGE: subtotal × value%, ROUNDED DOWN to whole taka (decision #2),
 *               then capped at maxDiscountAmount
 *   FIXED:      the value as entered
 * Never more than the subtotal itself — an order can't go below ৳0.
 */
export function discountAmount(
  rules: Pick<DiscountRules, 'type' | 'value' | 'maxDiscountAmount'>,
  subtotal: Prisma.Decimal,
): Prisma.Decimal {
  let amount =
    rules.type === DiscountType.PERCENTAGE
      ? subtotal.times(rules.value).dividedBy(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN)
      : rules.value
  if (rules.maxDiscountAmount && amount.greaterThan(rules.maxDiscountAmount))
    amount = rules.maxDiscountAmount
  if (amount.greaterThan(subtotal)) amount = subtotal
  return amount.lessThan(ZERO) ? ZERO : amount
}
