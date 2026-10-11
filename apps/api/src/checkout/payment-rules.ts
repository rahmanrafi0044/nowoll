import { Prisma } from '@nowoll/database'
import { canPayOnline } from '@nowoll/payments/money'
import type { StoreSettings } from '@nowoll/validation'

// ============================================================================
// Which payment methods an order may use (step 38c). ONE function, used by
// the checkout summary (to show the options and why one is greyed out) AND
// by order creation (to refuse a hand-made request) — so they always agree.
// The rules, in Admin → Settings → Payments:
//   • each method can be switched off (at least one stays on — SettingsService)
//   • cash on delivery up to a limit on the amount the courier collects
//   • a minimum order: products after any discount (not delivery)
// Plus what isn't the admin's to change: SSLCommerz must be set up on the
// server (keys are developer-side) and only takes ৳10 – ৳5,00,000.
// ============================================================================

export type PaymentProblemCode =
  'COD_OFF' | 'COD_LIMIT' | 'ONLINE_PAYMENT_UNAVAILABLE' | 'ONLINE_PAYMENT_AMOUNT'

export interface PaymentOption {
  method: 'SSLCOMMERZ' | 'COD'
  title: string
  description: string
  available: boolean
  problem: { code: PaymentProblemCode; message: string } | null
}

export interface PaymentRules {
  options: PaymentOption[]
  /** null = no minimum. shortBy 0 = the order is big enough. */
  minimumOrder: { amount: Prisma.Decimal; shortBy: Prisma.Decimal } | null
}

type Rules = Pick<
  StoreSettings,
  | 'payment_cod_enabled'
  | 'payment_online_enabled'
  | 'payment_cod_description'
  | 'payment_online_description'
  | 'cod_max_total'
  | 'min_order_amount'
>

/** ৳10,000 / ৳1,00,000 — the way amounts are written in Bangladesh. */
const taka = (n: number) => `৳${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export function paymentRules(input: {
  total: Prisma.Decimal
  afterDiscount: Prisma.Decimal
  settings: Rules
  /** The SSLCommerz keys are on the server (PaymentsService.onlineConfigured). */
  onlineConfigured: boolean
}): PaymentRules {
  const { total, afterDiscount, settings: s } = input

  const onlineProblem: PaymentOption['problem'] =
    !s.payment_online_enabled || !input.onlineConfigured
      ? {
          code: 'ONLINE_PAYMENT_UNAVAILABLE',
          message: "Online payment isn't available right now. Please choose cash on delivery.",
        }
      : !canPayOnline(total.toString())
        ? {
            code: 'ONLINE_PAYMENT_AMOUNT',
            message: 'Online payment is available for orders from ৳10 to ৳5,00,000.',
          }
        : null

  const codProblem: PaymentOption['problem'] = !s.payment_cod_enabled
    ? { code: 'COD_OFF', message: "Cash on delivery isn't available right now. Please pay online." }
    : s.cod_max_total > 0 && total.greaterThan(s.cod_max_total)
      ? {
          code: 'COD_LIMIT',
          message: `Cash on delivery is available for orders up to ${taka(s.cod_max_total)}. Please pay online.`,
        }
      : null

  const min = s.min_order_amount > 0 ? new Prisma.Decimal(s.min_order_amount) : null
  return {
    options: [
      {
        method: 'SSLCOMMERZ',
        title: 'Pay online',
        description:
          s.payment_online_description ||
          'Card, bKash, Nagad or Rocket — on SSLCommerz’s secure page',
        available: onlineProblem === null,
        problem: onlineProblem,
      },
      {
        method: 'COD',
        title: 'Cash on delivery',
        description: s.payment_cod_description || 'Pay the courier when your parcel arrives',
        available: codProblem === null,
        problem: codProblem,
      },
    ],
    minimumOrder: min
      ? { amount: min, shortBy: Prisma.Decimal.max(0, min.minus(afterDiscount)) }
      : null,
  }
}

/** The refusal for an order below the minimum (null when it's big enough). */
export function minimumOrderProblem(rules: PaymentRules) {
  const m = rules.minimumOrder
  if (!m || m.shortBy.lessThanOrEqualTo(0)) return null
  return {
    code: 'BELOW_MINIMUM_ORDER' as const,
    message: `The minimum order is ${taka(m.amount.toNumber())} (products, after any discount) — add ${taka(m.shortBy.toNumber())} more.`,
    shortBy: m.shortBy.toString(),
  }
}
