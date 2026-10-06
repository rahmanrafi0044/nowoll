// Example data for every template — used by the tests AND the preview script
// (pnpm email:preview sends each one to Mailpit, so they can be seen in a browser).
import { orderLink } from './links.js'
import type { EmailContent } from './render.js'
import { lowStockEmail } from './templates/admin.js'
import {
  newsletterConfirmEmail,
  orderConfirmationEmail,
  orderDeliveredEmail,
  orderShippedEmail,
  paymentConfirmedEmail,
  refundProcessedEmail,
  returnApprovedEmail,
  returnRejectedEmail,
  welcomeEmail,
} from './templates/customer.js'
import { supabaseResetPasswordEmail } from './templates/supabase.js'

export const SITE = 'https://nowoll.com'
export const link = orderLink(SITE, { number: 'NW-10001', signedIn: true })
export const totals = {
  subtotal: '2980',
  discount: '298',
  discountCode: 'TEN',
  shippingFee: '60',
  vatRate: '0',
  vatAmount: '0',
  total: '2742',
}
export const lines = [
  { productName: 'Oxford Shirt', variantLabel: 'M / Blue', quantity: 2, lineTotal: '2980' },
]

/** Every template with example data. */
export const EXAMPLES: Record<string, EmailContent> = {
  welcome: welcomeEmail({ name: 'Rafi Rahman', shopUrl: `${SITE}/shop` }),
  orderConfirmation: orderConfirmationEmail({
    name: 'Rafi Rahman',
    orderNumber: 'NW-10001',
    placedAt: '2026-10-06T04:00:00.000Z',
    paymentMethod: 'COD',
    lines,
    totals,
    address: 'House 12, Road 5, Dhanmondi, Dhaka',
    link,
  }),
  paymentConfirmed: paymentConfirmedEmail({
    name: 'Rafi Rahman',
    orderNumber: 'NW-10007',
    placedAt: '2026-10-06T04:00:00.000Z',
    lines: [
      {
        productName: 'Eid Silk Panjabi',
        variantLabel: '40 / Maroon',
        quantity: 1,
        lineTotal: '3490',
      },
    ],
    totals: {
      subtotal: '3490',
      discount: '0',
      discountCode: null,
      shippingFee: '60',
      vatRate: '0',
      vatAmount: '0',
      total: '3550',
    },
    address: 'House 12, Road 5, Dhanmondi, Dhaka',
    link,
  }),
  shipped: orderShippedEmail({
    name: 'Rafi',
    orderNumber: 'NW-10001',
    courierName: 'Steadfast',
    trackingNumber: 'SF123456',
    link,
  }),
  delivered: orderDeliveredEmail({
    name: 'Rafi',
    orderNumber: 'NW-10001',
    link,
    returnWindowDays: 7,
  }),
  returnApproved: returnApprovedEmail({
    name: 'Rafi',
    orderNumber: 'NW-10001',
    lines: [{ productName: 'Oxford Shirt', variantLabel: 'M / Blue', quantity: 1 }],
    instructions: 'Our courier collects it tomorrow between 10am and 6pm.',
    link,
  }),
  returnRejected: returnRejectedEmail({
    name: 'Rafi',
    orderNumber: 'NW-10001',
    reason: 'Worn — tags removed.',
    link,
  }),
  refundProcessed: refundProcessedEmail({
    name: 'Rafi',
    orderNumber: 'NW-10001',
    amount: '1341',
    method: 'GATEWAY',
    link,
  }),
  newsletterConfirm: newsletterConfirmEmail({
    confirmUrl: `${SITE}/newsletter/confirm?token=abc`,
    unsubscribeUrl: `${SITE}/newsletter/unsubscribe?token=abc`,
  }),
  lowStock: lowStockEmail({
    items: [
      {
        productName: 'Oxford Shirt',
        variantLabel: 'M / Blue',
        sku: 'OXF-M-BLU',
        stock: 3,
        threshold: 5,
      },
    ],
    inventoryUrl: 'https://admin.nowoll.com/inventory',
  }),
  resetPassword: supabaseResetPasswordEmail(),
}
