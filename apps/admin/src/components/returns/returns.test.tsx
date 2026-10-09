import type { AdminRefundView, AdminReturnView } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { APPROVE_TEMPLATE } from '@/lib/return-labels'
import { parseReturnFilters } from '@/lib/return-filters'
import * as api from '@/lib/returns-api'
import { ReturnDetail } from './return-detail'
import { ReturnList } from './return-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/returns',
}))
vi.mock('@/lib/returns-api', () => ({
  fetchReturns: vi.fn(),
  fetchReturn: vi.fn(),
  approveReturn: vi.fn(),
  rejectReturn: vi.fn(),
  receiveReturn: vi.fn(),
  refundReturn: vi.fn(),
  resolveRefund: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const RETURN: AdminReturnView = {
  id: 'r1',
  orderId: 'o1',
  orderNumber: 'NW-10020',
  status: 'REQUESTED',
  reason: 'WRONG_SIZE',
  customerNote: 'Too small',
  adminNote: null,
  rejectionReason: null,
  refundAmount: null,
  items: [
    {
      orderItemId: 'i1',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      imageUrl: null,
      quantity: 1,
      restock: true,
    },
    {
      orderItemId: 'i2',
      productName: 'Chino',
      variantLabel: '32',
      imageUrl: null,
      quantity: 1,
      restock: true,
    },
  ],
  customer: { id: 'u1', name: 'Rafi', email: 'rafi@example.com', phone: '+8801712345678' },
  paymentMethod: 'COD',
  suggestedRefund: '1341',
  maxRefundable: '1550',
  refunds: [],
  createdAt: '2026-10-08T04:00:00Z',
  approvedAt: null,
  rejectedAt: null,
  receivedAt: null,
}
const at = (over: Partial<AdminReturnView>) => ({ ...RETURN, ...over })
const refund = (over: Partial<AdminRefundView>): AdminRefundView => ({
  id: 'f1',
  amount: '1490',
  status: 'PENDING',
  method: 'GATEWAY',
  stage: 'NO_ANSWER',
  reference: null,
  gatewayRefId: null,
  note: null,
  processedAt: null,
  createdAt: '2026-10-09T05:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchReturns.mockResolvedValue(
    ok({ items: [RETURN], total: 1, page: 1, pageSize: 25, totalPages: 1 }),
  )
  mocked.fetchReturn.mockResolvedValue(ok(RETURN))
})
const next = () => screen.getByRole('region', { name: 'Next step' })
const open = async () => {
  render(<ReturnDetail id="r1" />)
  await screen.findByRole('heading', { name: 'Return of NW-10020' })
}

describe('parseReturnFilters', () => {
  it('opens on "To decide"; all / a search looks everywhere', () => {
    expect(parseReturnFilters({})).toEqual({
      status: 'REQUESTED',
      q: undefined,
      page: undefined,
      all: false,
    })
    expect(parseReturnFilters({ status: 'RECEIVED' })).toMatchObject({
      status: 'RECEIVED',
      all: false,
    })
    expect(parseReturnFilters({ status: 'all' })).toMatchObject({ status: undefined, all: true })
    expect(parseReturnFilters({ q: 'NW-10020' })).toMatchObject({
      status: undefined,
      q: 'NW-10020',
      all: true,
    })
    expect(parseReturnFilters({ status: 'LOST' })).toMatchObject({ status: 'REQUESTED' })
  })
})

describe('ReturnList', () => {
  it('tabs follow the work (current one marked); rows say what, who and why', async () => {
    render(<ReturnList filters={{ status: 'REQUESTED' }} all={false} />)
    const link = await screen.findByRole('link', { name: 'Return of NW-10020' })
    expect(link).toHaveAttribute('href', '/admin/returns/r1')
    const row = link.closest('tr')!
    expect(row).toHaveTextContent('1 × Oxford Shirt (M / Blue), 1 × Chino (32)')
    expect(row).toHaveTextContent('Wrong size')
    const tabs = screen.getByRole('navigation', { name: 'Return stages' })
    expect(within(tabs).getByRole('link', { name: 'To decide' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(tabs).getByRole('link', { name: 'To refund' })).toHaveAttribute(
      'href',
      '/admin/returns?status=RECEIVED',
    )
    expect(mocked.fetchReturns).toHaveBeenCalledWith({ status: 'REQUESTED' })
  })

  it('search by order number looks in every stage', async () => {
    render(<ReturnList filters={{ status: 'REQUESTED' }} all={false} />)
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Order number'), { target: { value: ' NW-10020 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(push).toHaveBeenCalledWith('/admin/returns?q=NW-10020&status=all')
  })
})

describe('ReturnDetail — to decide', () => {
  it('approve: the instructions start from the template; sent as written', async () => {
    mocked.approveReturn.mockResolvedValue(ok(at({ status: 'APPROVED' })))
    await open()
    fireEvent.click(within(next()).getByRole('button', { name: 'Approve…' }))
    const box = within(next()).getByLabelText('Instructions for the customer')
    expect(box).toHaveValue(APPROVE_TEMPLATE)
    fireEvent.change(box, { target: { value: 'Courier on Sunday.' } })
    fireEvent.click(within(next()).getByRole('button', { name: 'Approve return' }))
    await waitFor(() =>
      expect(mocked.approveReturn).toHaveBeenCalledWith('r1', 'Courier on Sunday.'),
    )
  })

  it('reject: a reason is required (the customer reads it)', async () => {
    mocked.rejectReturn.mockResolvedValue(ok(at({ status: 'REJECTED' })))
    await open()
    fireEvent.click(within(next()).getByRole('button', { name: 'Reject…' }))
    fireEvent.click(within(next()).getByRole('button', { name: 'Reject return' }))
    expect(within(next()).getByRole('alert')).toHaveTextContent('Give a reason')
    expect(mocked.rejectReturn).not.toHaveBeenCalled()
    fireEvent.change(within(next()).getByLabelText('Reason (the customer reads it)'), {
      target: { value: 'Worn — tags removed.' },
    })
    fireEvent.click(within(next()).getByRole('button', { name: 'Reject return' }))
    await waitFor(() =>
      expect(mocked.rejectReturn).toHaveBeenCalledWith('r1', 'Worn — tags removed.'),
    )
  })

  it('shows the customer’s note, the reason, and links to the order and customer', async () => {
    await open()
    expect(screen.getByRole('region', { name: 'Items' })).toHaveTextContent(
      'Customer wrote: Too small',
    )
    expect(screen.getByRole('link', { name: 'Open the order' })).toHaveAttribute(
      'href',
      '/admin/orders/o1',
    )
    expect(screen.getByRole('link', { name: 'Rafi' })).toHaveAttribute(
      'href',
      '/admin/customers/u1',
    )
  })
})

describe('ReturnDetail — parcel received', () => {
  it('each item: put back on sale (ticked) — untick a damaged one', async () => {
    mocked.fetchReturn.mockResolvedValue(
      ok(at({ status: 'APPROVED', approvedAt: '2026-10-08T06:00:00Z', adminNote: 'Courier.' })),
    )
    mocked.receiveReturn.mockResolvedValue(ok(at({ status: 'RECEIVED' })))
    await open()
    fireEvent.click(within(next()).getByLabelText(/Put back on sale: 1 × Chino/))
    fireEvent.click(within(next()).getByRole('button', { name: 'Parcel received' }))
    await waitFor(() =>
      expect(mocked.receiveReturn).toHaveBeenCalledWith('r1', [
        { orderItemId: 'i1', restock: true },
        { orderItemId: 'i2', restock: false },
      ]),
    )
  })
})

describe('ReturnDetail — refund', () => {
  const receivedCod = at({ status: 'RECEIVED', receivedAt: '2026-10-09T04:00:00Z' })

  it('COD: by hand only; amount starts at the suggested refund; reference required; CONFIRM before anything is sent', async () => {
    mocked.fetchReturn.mockResolvedValue(ok(receivedCod))
    mocked.refundReturn.mockResolvedValue(ok(at({ status: 'REFUNDED', refundAmount: '1341' })))
    await open()
    expect(within(next()).queryByLabelText(/SSLCommerz/)).not.toBeInTheDocument()
    expect(within(next()).getByLabelText('Amount (৳)')).toHaveValue('1341')
    fireEvent.click(within(next()).getByRole('button', { name: 'Review refund…' }))
    expect(within(next()).getByRole('alert')).toHaveTextContent('Say how you paid it back')
    fireEvent.change(within(next()).getByLabelText('How it was paid'), {
      target: { value: 'bKash TrxID 8N7A6K' },
    })
    fireEvent.click(within(next()).getByRole('button', { name: 'Review refund…' }))
    const confirm = within(next()).getByRole('group', { name: 'Confirm the refund' })
    expect(confirm).toHaveTextContent(
      'Record that you paid back ৳1,341 by hand (bKash TrxID 8N7A6K)?',
    )
    expect(mocked.refundReturn).not.toHaveBeenCalled() // nothing sent until confirmed
    fireEvent.click(within(confirm).getByRole('button', { name: 'Yes, refund ৳1,341' }))
    await waitFor(() =>
      expect(mocked.refundReturn).toHaveBeenCalledWith('r1', {
        amount: '1341',
        method: 'MANUAL',
        reference: 'bKash TrxID 8N7A6K',
      }),
    )
  })

  it('more than can still be refunded → refused before review', async () => {
    mocked.fetchReturn.mockResolvedValue(ok(receivedCod))
    await open()
    fireEvent.change(within(next()).getByLabelText('Amount (৳)'), { target: { value: '1551' } })
    fireEvent.change(within(next()).getByLabelText('How it was paid'), {
      target: { value: 'cash' },
    })
    fireEvent.click(within(next()).getByRole('button', { name: 'Review refund…' }))
    expect(within(next()).getByRole('alert')).toHaveTextContent(
      'At most ৳1,550 can still be refunded.',
    )
    expect(
      within(next()).queryByRole('group', { name: 'Confirm the refund' }),
    ).not.toBeInTheDocument()
  })

  it('online: SSLCommerz is the default; the confirmation says real money moves; a refusal is shown and the page reloads', async () => {
    mocked.fetchReturn.mockResolvedValue(
      ok(at({ status: 'RECEIVED', paymentMethod: 'SSLCOMMERZ' })),
    )
    mocked.refundReturn.mockResolvedValue({
      ok: false,
      status: 502,
      message: 'SSLCommerz refused the refund.',
    })
    await open()
    expect(within(next()).getByLabelText(/through SSLCommerz/)).toBeChecked()
    fireEvent.click(within(next()).getByRole('button', { name: 'Review refund…' }))
    expect(within(next()).getByRole('group', { name: 'Confirm the refund' })).toHaveTextContent(
      'Refund ৳1,341 to the customer through SSLCommerz? This sends real money back.',
    )
    fireEvent.click(within(next()).getByRole('button', { name: 'Yes, refund ৳1,341' }))
    await waitFor(() =>
      expect(mocked.refundReturn).toHaveBeenCalledWith('r1', { amount: '1341', method: 'GATEWAY' }),
    )
    expect(await within(next()).findByRole('alert')).toHaveTextContent(
      'SSLCommerz refused the refund.',
    )
    expect(mocked.fetchReturn).toHaveBeenCalledTimes(2) // reloaded: the FAILED refund now shows
  })
})

describe('ReturnDetail — a refund SSLCommerz never answered about', () => {
  it('explained; resolve needs an outcome and a note', async () => {
    mocked.fetchReturn.mockResolvedValue(
      ok(at({ status: 'RECEIVED', paymentMethod: 'SSLCOMMERZ', refunds: [refund({})] })),
    )
    mocked.resolveRefund.mockResolvedValue(ok(at({ status: 'REFUNDED' })))
    await open()
    const refunds = screen.getByRole('region', { name: 'Refunds' })
    expect(refunds).toHaveTextContent('No answer from SSLCommerz')
    expect(refunds).toHaveTextContent('Check the refund in the SSLCommerz merchant panel')
    expect(next()).toHaveTextContent('A refund is in progress') // no second refund meanwhile
    fireEvent.click(within(refunds).getByRole('button', { name: 'Save outcome' }))
    expect(within(refunds).getByRole('alert')).toHaveTextContent(
      'Choose what the SSLCommerz panel shows.',
    )
    fireEvent.click(within(refunds).getByLabelText('went back to the customer'))
    fireEvent.change(within(refunds).getByLabelText('Note'), {
      target: { value: 'Refunded per panel.' },
    })
    fireEvent.click(within(refunds).getByRole('button', { name: 'Save outcome' }))
    await waitFor(() =>
      expect(mocked.resolveRefund).toHaveBeenCalledWith('r1', 'f1', {
        outcome: 'REFUNDED',
        note: 'Refunded per panel.',
      }),
    )
  })

  it('"processing" is explained as nothing-to-do (re-checked every 15 minutes)', async () => {
    mocked.fetchReturn.mockResolvedValue(
      ok(
        at({
          status: 'RECEIVED',
          paymentMethod: 'SSLCOMMERZ',
          refunds: [refund({ stage: 'PROCESSING', gatewayRefId: 'RREF-1' })],
        }),
      ),
    )
    await open()
    const refunds = screen.getByRole('region', { name: 'Refunds' })
    expect(refunds).toHaveTextContent('SSLCommerz processing')
    expect(refunds).toHaveTextContent('every 15 minutes')
    expect(
      within(refunds).getByRole('button', { name: 'Record the outcome by hand…' }),
    ).toBeInTheDocument()
  })
})

describe('ReturnDetail — history', () => {
  it('asked → approved (with the instructions) → received → refunded, newest first; restock shown per item', async () => {
    mocked.fetchReturn.mockResolvedValue(
      ok(
        at({
          status: 'REFUNDED',
          refundAmount: '1490',
          adminNote: 'Courier on Sunday.',
          approvedAt: '2026-10-08T06:00:00Z',
          receivedAt: '2026-10-09T04:00:00Z',
          items: [{ ...RETURN.items[0]!, restock: false }],
          refunds: [
            refund({
              status: 'PROCESSED',
              stage: null,
              method: 'MANUAL',
              reference: 'cash',
              processedAt: '2026-10-09T05:00:00Z',
            }),
          ],
        }),
      ),
    )
    await open()
    const steps = within(screen.getByRole('region', { name: 'History' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent?.split(' · ')[0])).toEqual([
      'Refunded ৳1,490',
      'Parcel received',
      'Approved',
      'Customer asked to return',
    ])
    expect(steps[2]).toHaveTextContent('Courier on Sunday.')
    expect(screen.getByRole('region', { name: 'Items' })).toHaveTextContent('Not resold (damaged)')
    expect(screen.getByRole('region', { name: 'Refunds' })).toHaveTextContent('By hand — cash')
  })
})
