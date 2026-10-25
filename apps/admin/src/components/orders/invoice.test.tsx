import type { AdminOrderDetail, OrderInvoice } from '@nowoll/types'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { InvoiceSheet } from './invoice'

const ORDER = {
  id: 'o1',
  number: 'NW-10015',
  status: 'SHIPPED',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  customer: {
    name: 'রাফি রহমান',
    email: 'rafi@example.com',
    phone: '+8801712345678',
    hasAccount: true,
    accountId: 'u1',
    parcelsReturned: 0,
  },
  address: {
    line1: 'বাড়ি ১২, রোড ৫',
    line2: null,
    area: 'Dhanmondi',
    district: 'Dhaka',
    division: 'Dhaka',
    postalCode: '1205',
    zoneName: 'Inside Dhaka',
  },
  items: [
    {
      id: 'i1',
      productId: 'p1',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      sku: 'OXF-M-BLU',
      imageUrl: null,
      unitPrice: '1490',
      quantity: 2,
      lineTotal: '2980',
    },
  ],
  totals: {
    subtotal: '2980',
    discountAmount: '298',
    discountCode: 'EID10',
    shippingFee: '60',
    vatRate: '0',
    vatAmount: '0',
    total: '2742',
  },
  payments: [],
  courierName: 'Steadfast',
  trackingNumber: 'SF123',
  courierConsignmentId: null,
  courierStatus: null,
  courierStatusAt: null,
  courierBooking: { name: 'Steadfast', readiness: 'off' },
  customerNote: null,
  adminNotes: 'Never on an invoice',
  cancelReason: null,
  timeline: [],
  allowedNext: ['DELIVERED'],
  canMarkCashCollected: true,
  canMarkNotDelivered: true,
  createdAt: '2026-10-05T18:30:00Z',
  updatedAt: '2026-10-05T18:30:00Z',
} as AdminOrderDetail

const invoice = (
  over: Partial<OrderInvoice> = {},
  order: Partial<AdminOrderDetail> = {},
): OrderInvoice => ({
  order: { ...ORDER, ...order },
  store: {
    name: 'Nowoll',
    tagline: 'always new',
    address: 'House 1, Dhanmondi',
    phone: '+8801000000000',
    email: 'hello@nowoll.com',
  },
  issuedOn: '2026-10-07',
  ...over,
})

describe('InvoiceSheet', () => {
  it('shop, invoice number and dates (Dhaka), customer (Bangla kept as typed), items, totals', () => {
    render(<InvoiceSheet invoice={invoice()} />)
    const sheet = screen.getByRole('article', { name: 'Invoice NW-10015' })
    expect(sheet).toHaveTextContent('Nowoll')
    expect(sheet).toHaveTextContent('House 1, Dhanmondi')
    expect(sheet).toHaveTextContent('Invoice no.NW-10015')
    expect(sheet).toHaveTextContent('Order date6 Oct 2026') // 00:30 on the 6th in Dhaka
    expect(sheet).toHaveTextContent('IssuedWednesday 7 October')
    expect(sheet).toHaveTextContent('রাফি রহমান')
    expect(sheet).toHaveTextContent('বাড়ি ১২, রোড ৫')
    expect(within(sheet).getByRole('row', { name: /Oxford Shirt/ })).toHaveTextContent(
      '2৳1,490৳2,980',
    )
    expect(sheet).toHaveTextContent('Discount (EID10)−৳298')
    expect(sheet).toHaveTextContent('Total৳2,742')
    expect(sheet).toHaveTextContent('Courier: Steadfast · Tracking SF123')
  })

  it('never shows staff-only notes', () => {
    render(<InvoiceSheet invoice={invoice()} />)
    expect(screen.queryByText(/Never on an invoice/)).not.toBeInTheDocument()
  })

  it('payment line says what the customer owes', () => {
    const { unmount } = render(<InvoiceSheet invoice={invoice()} />)
    expect(screen.getByText('Cash on delivery — ৳2,742 to be paid on delivery')).toBeInTheDocument()
    unmount()
    render(
      <InvoiceSheet
        invoice={invoice({}, { paymentStatus: 'PAID', paymentMethod: 'SSLCOMMERZ' })}
      />,
    )
    expect(screen.getByText('Paid online (SSLCommerz)')).toBeInTheDocument()
  })

  it('missing shop details: left off, with an on-screen-only hint', () => {
    render(
      <InvoiceSheet
        invoice={invoice({
          store: { name: 'Nowoll', tagline: null, address: null, phone: null, email: null },
        })}
      />,
    )
    const hint = screen.getByText(/isn’t set yet/)
    expect(hint.closest('.print\\:hidden')).not.toBeNull()
    expect(screen.getByRole('article')).not.toHaveTextContent('null')
  })

  it('"Print / Save as PDF" opens the browser’s print dialog', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<InvoiceSheet invoice={invoice()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))
    expect(print).toHaveBeenCalled()
  })
})
