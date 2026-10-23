import type { AdminOrderDetail, AdminOrderRow } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { parseOrderFilters } from '@/lib/order-filters'
import * as api from '@/lib/orders-api'
import { OrderDetail } from './order-detail'
import { OrderList } from './order-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/orders',
}))
vi.mock('@/lib/orders-api', () => ({
  fetchOrders: vi.fn(),
  fetchOrder: vi.fn(),
  changeOrderStatus: vi.fn(),
  updateTracking: vi.fn(),
  updateOrderNotes: vi.fn(),
  markCashCollected: vi.fn(),
  bookCourier: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const ROW: AdminOrderRow = {
  id: 'o1',
  number: 'NW-10001',
  status: 'PENDING',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  customerName: 'Rafi Rahman',
  phone: '+8801712345678',
  email: 'rafi@example.com',
  district: 'Dhaka',
  itemCount: 2,
  total: '3040',
  createdAt: '2026-10-05T18:30:00Z',
}

const ORDER: AdminOrderDetail = {
  id: 'o1',
  number: 'NW-10001',
  status: 'PENDING',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  customer: {
    name: 'Rafi Rahman',
    email: 'rafi@example.com',
    phone: '+8801712345678',
    hasAccount: false,
    accountId: null,
  },
  address: {
    line1: 'House 12, Road 5',
    line2: null,
    area: 'Dhanmondi',
    district: 'Dhaka',
    division: 'Dhaka',
    postalCode: null,
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
    discountAmount: '0',
    discountCode: null,
    shippingFee: '60',
    vatRate: '0',
    vatAmount: '0',
    total: '3040',
  },
  payments: [
    {
      id: 'pay1',
      method: 'COD',
      status: 'PENDING',
      amount: '3040',
      transactionId: 'NW10001-COD',
      bankTransactionId: null,
      paidAt: null,
      createdAt: '2026-10-05T18:30:00Z',
    },
  ],
  courierName: null,
  trackingNumber: null,
  courierConsignmentId: null,
  courierStatus: null,
  courierStatusAt: null,
  courierBooking: { name: 'Steadfast', readiness: 'off' },
  customerNote: 'Please call before coming',
  adminNotes: null,
  cancelReason: null,
  timeline: [
    { from: null, to: 'PENDING', note: 'Order placed', by: null, at: '2026-10-05T18:30:00Z' },
  ],
  allowedNext: ['CONFIRMED', 'CANCELLED'],
  canMarkCashCollected: false,
  createdAt: '2026-10-05T18:30:00Z',
  updatedAt: '2026-10-05T18:30:00Z',
}
const shipped: AdminOrderDetail = {
  ...ORDER,
  status: 'SHIPPED',
  courierName: 'Steadfast',
  trackingNumber: 'SF123',
  allowedNext: ['DELIVERED'],
  canMarkCashCollected: true,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchOrders.mockResolvedValue(
    ok({ items: [ROW], total: 1, page: 1, pageSize: 25, totalPages: 1 }),
  )
  mocked.fetchOrder.mockResolvedValue(ok(ORDER))
})
const card = (name: string) => screen.getByRole('region', { name })
const openOrder = async () => {
  render(<OrderDetail id="o1" />)
  await screen.findByRole('heading', { name: 'NW-10001' })
}

describe('OrderList', () => {
  it('rows: number link, Dhaka time, customer, status and payment in words', async () => {
    render(<OrderList filters={{}} />)
    const link = await screen.findByRole('link', { name: 'NW-10001' })
    expect(link).toHaveAttribute('href', '/admin/orders/o1')
    const row = link.closest('tr')!
    expect(row).toHaveTextContent('6 Oct, 12:30 am') // 18:30 UTC = 00:30 Dhaka
    expect(row).toHaveTextContent('Rafi Rahman')
    expect(row).toHaveTextContent('Pending')
    expect(row).toHaveTextContent('Unpaid')
    expect(row).toHaveTextContent('Cash on delivery')
    expect(row).toHaveTextContent('৳3,040')
  })

  it('filters → the page address (page 1)', async () => {
    render(<OrderList filters={{ page: 2 }} />)
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SHIPPED' } })
    expect(push).toHaveBeenLastCalledWith('/admin/orders?status=SHIPPED')
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'COD' } })
    expect(push).toHaveBeenLastCalledWith('/admin/orders?paymentMethod=COD')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    expect(push).toHaveBeenLastCalledWith('/admin/orders?from=2026-10-01')
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: ' NW-10001 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(push).toHaveBeenLastCalledWith('/admin/orders?q=NW-10001')
  })

  it('parseOrderFilters keeps known values only', () => {
    expect(
      parseOrderFilters({
        status: 'SHIPPED',
        paymentMethod: 'COD',
        from: '2026-10-01',
        to: 'yesterday',
        page: '3',
      }),
    ).toMatchObject({
      status: 'SHIPPED',
      paymentMethod: 'COD',
      from: '2026-10-01',
      to: undefined,
      page: 3,
    })
    expect(parseOrderFilters({ status: 'CONFIRMED,PROCESSING' }).status).toBe(
      'CONFIRMED,PROCESSING',
    )
    expect(parseOrderFilters({ status: 'CONFIRMED,LOST' }).status).toBeUndefined()
    expect(parseOrderFilters({ status: 'LOST', paymentMethod: 'bkash' })).toMatchObject({
      status: undefined,
      paymentMethod: undefined,
    })
  })
})

describe('OrderDetail', () => {
  it('an order from an account links to the customer page', async () => {
    mocked.fetchOrder.mockResolvedValue(
      ok({ ...ORDER, customer: { ...ORDER.customer, hasAccount: true, accountId: 'u1' } }),
    )
    await openOrder()
    expect(
      within(card('Customer')).getByRole('link', { name: 'View customer account' }),
    ).toHaveAttribute('href', '/admin/customers/u1')
  })

  it('shows items, totals, the customer’s note, a phone link and the history', async () => {
    await openOrder()
    const items = card('Items')
    expect(items).toHaveTextContent('Oxford Shirt')
    expect(items).toHaveTextContent('2 × ৳1,490')
    expect(items).toHaveTextContent('Delivery (Inside Dhaka)৳60')
    expect(items).toHaveTextContent('Total৳3,040')
    expect(items).toHaveTextContent('Please call before coming')
    expect(within(card('Customer')).getByRole('link', { name: '+8801712345678' })).toHaveAttribute(
      'href',
      'tel:+8801712345678',
    )
    expect(card('History')).toHaveTextContent('Order placed')
    expect(card('History')).toHaveTextContent('Automatic')
    expect(card('Customer')).toHaveTextContent('Guest checkout') // no account → no link
    expect(screen.getByRole('link', { name: 'Invoice ↗' })).toHaveAttribute(
      'href',
      '/admin/orders/o1/invoice',
    )
  })

  it('the buttons are exactly what the API allows next', async () => {
    await openOrder()
    const next = card('Next step')
    expect(
      within(next)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Confirm order', 'Cancel order'])
  })

  it('confirm sends the status the page SAW, plus the note', async () => {
    mocked.changeOrderStatus.mockResolvedValue(
      ok({ ...ORDER, status: 'CONFIRMED', allowedNext: ['PROCESSING', 'SHIPPED', 'CANCELLED'] }),
    )
    await openOrder()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Called — OK' } })
    mocked.fetchOrder.mockResolvedValue(
      ok({ ...ORDER, status: 'CONFIRMED', allowedNext: ['PROCESSING', 'SHIPPED', 'CANCELLED'] }),
    )
    fireEvent.click(within(card('Next step')).getByRole('button', { name: 'Confirm order' }))
    await waitFor(() =>
      expect(mocked.changeOrderStatus).toHaveBeenCalledWith('o1', {
        from: 'PENDING',
        to: 'CONFIRMED',
        note: 'Called — OK',
      }),
    )
    // the form closes and the NEW next steps appear
    expect(
      await within(card('Next step')).findByRole('button', { name: 'Start packing' }),
    ).toBeInTheDocument()
  })

  it('ship: courier + tracking required (checked before sending)', async () => {
    mocked.fetchOrder.mockResolvedValue(
      ok({ ...ORDER, status: 'CONFIRMED', allowedNext: ['PROCESSING', 'SHIPPED', 'CANCELLED'] }),
    )
    mocked.changeOrderStatus.mockResolvedValue(ok(shipped))
    await openOrder()
    fireEvent.click(screen.getByRole('button', { name: 'Mark shipped' }))
    const next = card('Next step')
    fireEvent.click(within(next).getByRole('button', { name: 'Mark shipped' }))
    expect(within(next).getByRole('alert')).toHaveTextContent(
      'Enter the courier and the tracking number.',
    )
    expect(mocked.changeOrderStatus).not.toHaveBeenCalled()
    fireEvent.change(within(next).getByLabelText('Courier'), { target: { value: 'Steadfast' } })
    fireEvent.change(within(next).getByLabelText('Tracking number'), {
      target: { value: ' SF123 ' },
    })
    fireEvent.click(within(next).getByRole('button', { name: 'Mark shipped' }))
    await waitFor(() =>
      expect(mocked.changeOrderStatus).toHaveBeenCalledWith('o1', {
        from: 'CONFIRMED',
        to: 'SHIPPED',
        courierName: 'Steadfast',
        trackingNumber: 'SF123',
      }),
    )
  })

  describe('Phase 2: "Book with Steadfast"', () => {
    const confirmed = (readiness: AdminOrderDetail['courierBooking']['readiness']) =>
      ok({
        ...ORDER,
        status: 'CONFIRMED' as const,
        allowedNext: ['PROCESSING', 'SHIPPED', 'CANCELLED'] as AdminOrderDetail['allowedNext'],
        courierBooking: { name: 'Steadfast', readiness },
      })

    it('ready: says what is sent and what the rider collects; one click books it', async () => {
      mocked.fetchOrder.mockResolvedValue(confirmed('ready'))
      mocked.bookCourier.mockResolvedValue(ok(shipped))
      await openOrder()
      fireEvent.click(screen.getByRole('button', { name: 'Mark shipped' }))
      const next = card('Next step')
      expect(next).toHaveTextContent(/the rider collects ৳3,040 in cash/)
      fireEvent.click(within(next).getByRole('button', { name: 'Book with Steadfast' }))
      await waitFor(() => expect(mocked.bookCourier).toHaveBeenCalledWith('o1', 'CONFIRMED'))
      expect(mocked.changeOrderStatus).not.toHaveBeenCalled()
    })

    it('refused by the courier → the reason is shown, the order stays', async () => {
      mocked.fetchOrder.mockResolvedValue(confirmed('ready'))
      mocked.bookCourier.mockResolvedValue({
        ok: false,
        status: 502,
        error: 'COURIER_REFUSED',
        message: 'Steadfast refused the parcel: Invalid phone number',
      })
      await openOrder()
      fireEvent.click(screen.getByRole('button', { name: 'Mark shipped' }))
      fireEvent.click(
        within(card('Next step')).getByRole('button', { name: 'Book with Steadfast' }),
      )
      expect(await within(card('Next step')).findByRole('alert')).toHaveTextContent(
        'Invalid phone number',
      )
    })

    it('not connected yet: the button is greyed out with the reason; manual tracking still there', async () => {
      mocked.fetchOrder.mockResolvedValue(confirmed('no_keys'))
      await openOrder()
      fireEvent.click(screen.getByRole('button', { name: 'Mark shipped' }))
      const next = card('Next step')
      expect(within(next).getByRole('button', { name: 'Book with Steadfast' })).toBeDisabled()
      expect(next).toHaveTextContent(/API key and secret key/)
      expect(within(next).getByLabelText('Tracking number')).toBeInTheDocument()
    })

    it('switched off in Settings: no Steadfast button at all', async () => {
      mocked.fetchOrder.mockResolvedValue(confirmed('off'))
      await openOrder()
      fireEvent.click(screen.getByRole('button', { name: 'Mark shipped' }))
      expect(
        within(card('Next step')).queryByRole('button', { name: 'Book with Steadfast' }),
      ).toBeNull()
    })
  })

  it('deliver a COD order: "cash collected" is ticked by default and sent', async () => {
    mocked.fetchOrder.mockResolvedValue(ok(shipped))
    mocked.changeOrderStatus.mockResolvedValue(
      ok({ ...shipped, status: 'DELIVERED', allowedNext: [] }),
    )
    await openOrder()
    fireEvent.click(screen.getByRole('button', { name: 'Mark delivered' }))
    expect(screen.getByLabelText(/Cash collected \(৳3,040\)/)).toBeChecked()
    fireEvent.click(within(card('Next step')).getByRole('button', { name: 'Mark delivered' }))
    await waitFor(() =>
      expect(mocked.changeOrderStatus).toHaveBeenCalledWith('o1', {
        from: 'SHIPPED',
        to: 'DELIVERED',
        cashCollected: true,
      }),
    )
  })

  it('cancel needs a reason and warns it can’t be undone', async () => {
    await openOrder()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    const next = card('Next step')
    expect(next).toHaveTextContent('can’t be undone')
    fireEvent.click(within(next).getByRole('button', { name: 'Cancel order' }))
    expect(within(next).getByRole('alert')).toHaveTextContent('Give a reason')
    expect(mocked.changeOrderStatus).not.toHaveBeenCalled()
  })

  it('a colleague changed it first → the form closes, the order reloads, and the notice says so', async () => {
    mocked.changeOrderStatus.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'ORDER_CHANGED',
      message: 'Order NW-10001 was just changed by someone else (it is now cancelled).',
    })
    await openOrder()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }))
    mocked.fetchOrder.mockResolvedValue(
      ok({ ...ORDER, status: 'CANCELLED', cancelReason: 'Customer said no', allowedNext: [] }),
    )
    fireEvent.click(within(card('Next step')).getByRole('button', { name: 'Confirm order' }))
    const next = card('Next step')
    expect(await within(next).findByRole('alert')).toHaveTextContent('changed by someone else')
    expect(await within(next).findByText('Cancelled: Customer said no')).toBeInTheDocument()
    expect(within(next).queryByRole('button')).not.toBeInTheDocument()
  })

  it('an unpaid online order explains that the payment confirms it', async () => {
    mocked.fetchOrder.mockResolvedValue(
      ok({ ...ORDER, paymentMethod: 'SSLCOMMERZ', allowedNext: ['CANCELLED'] }),
    )
    await openOrder()
    expect(card('Next step')).toHaveTextContent('Waiting for the online payment')
  })

  it('"Mark cash collected" when the API says it can be', async () => {
    mocked.fetchOrder.mockResolvedValue(ok(shipped))
    mocked.markCashCollected.mockResolvedValue(
      ok({ ...shipped, paymentStatus: 'PAID', canMarkCashCollected: false }),
    )
    await openOrder()
    fireEvent.click(within(card('Payment')).getByRole('button', { name: 'Mark cash collected' }))
    await waitFor(() => expect(mocked.markCashCollected).toHaveBeenCalledWith('o1'))
  })

  it('tracking can be corrected after shipping (no new email, and says so)', async () => {
    mocked.fetchOrder.mockResolvedValue(ok(shipped))
    mocked.updateTracking.mockResolvedValue(ok(shipped))
    await openOrder()
    const delivery = card('Delivery')
    expect(delivery).toHaveTextContent('Steadfast · SF123')
    fireEvent.click(within(delivery).getByRole('button', { name: 'Correct…' }))
    expect(delivery).toHaveTextContent('doesn’t send another email')
    fireEvent.change(within(delivery).getByLabelText('Tracking number'), {
      target: { value: 'SF1234' },
    })
    fireEvent.click(within(delivery).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.updateTracking).toHaveBeenCalledWith('o1', {
        courierName: 'Steadfast',
        trackingNumber: 'SF1234',
      }),
    )
  })

  it('staff notes: Save appears only when changed; empty clears them', async () => {
    mocked.fetchOrder.mockResolvedValue(ok({ ...ORDER, adminNotes: 'Fragile' }))
    mocked.updateOrderNotes.mockResolvedValue(ok(ORDER))
    await openOrder()
    const notes = card('Staff notes')
    expect(within(notes).queryByRole('button', { name: 'Save notes' })).not.toBeInTheDocument()
    fireEvent.change(within(notes).getByLabelText('Notes'), { target: { value: '   ' } })
    fireEvent.click(within(notes).getByRole('button', { name: 'Save notes' }))
    await waitFor(() => expect(mocked.updateOrderNotes).toHaveBeenCalledWith('o1', null))
  })
})
