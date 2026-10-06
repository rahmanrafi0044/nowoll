import type { PrismaClient } from '@nowoll/database'
import { orderLink, type ReceiptEmailData } from '@nowoll/email'

const displayNumber = (n: number) => `NW-${n}`

/**
 * Reads the order FRESH from the database and shapes it for the receipt
 * emails — the job only carried the order's id (step 27 decision #1).
 */
export async function loadReceipt(db: PrismaClient, orderId: string, siteUrl: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  })
  if (!order) return null
  const data: ReceiptEmailData = {
    name: order.customerName,
    orderNumber: displayNumber(order.orderNumber),
    placedAt: order.createdAt.toISOString(),
    lines: order.items.map((i) => ({
      productName: i.productName,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      lineTotal: i.lineTotal.toString(),
    })),
    totals: {
      subtotal: order.subtotal.toString(),
      discount: order.discountAmount.toString(),
      discountCode: order.discountCode,
      shippingFee: order.shippingFee.toString(),
      vatRate: order.vatRate.toString(),
      vatAmount: order.vatAmount.toString(),
      total: order.total.toString(),
    },
    address: [
      order.shippingAddressLine1,
      order.shippingAddressLine2,
      order.shippingArea,
      order.shippingDistrict,
    ]
      .filter(Boolean)
      .join(', '),
    // Signed in when ordering → their order page; guest → "Track your order".
    link: orderLink(siteUrl, {
      number: displayNumber(order.orderNumber),
      signedIn: order.userId !== null,
    }),
  }
  return { order, data }
}
