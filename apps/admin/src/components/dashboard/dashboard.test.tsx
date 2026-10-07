import type { AnalyticsSummary, RevenueSeries, TopProducts } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/analytics-api'
import { Dashboard } from './dashboard'
import { niceTicks } from './revenue-chart'

vi.mock('@/lib/analytics-api', () => ({
  fetchSummary: vi.fn(),
  fetchRevenue: vi.fn(),
  fetchTopProducts: vi.fn(),
  fetchLowStock: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })
const failed = (status: number, message = 'The server had a problem.') =>
  ({ ok: false, status, message }) as const

const SUMMARY: AnalyticsSummary = {
  today: { date: '2026-10-06', revenue: '1300', orders: 2 },
  last7Days: {
    from: '2026-09-30',
    to: '2026-10-06',
    revenue: '2000',
    orders: 4,
    averageOrderValue: '500',
  },
  previous7Days: { revenue: '2500', orders: 2 },
  newCustomers: { last7Days: 3, previous7Days: 0 },
  needsAttention: { codToConfirm: 2, toShip: 1, paymentsToReview: 0, returnRequests: 1 },
}
const day = (date: string, revenue: string, orders: number) => ({ date, revenue, orders })
const REVENUE: RevenueSeries = {
  days: [
    day('2026-09-30', '200', 1),
    day('2026-10-01', '0', 0),
    day('2026-10-02', '0', 0),
    day('2026-10-03', '0', 0),
    day('2026-10-04', '0', 0),
    day('2026-10-05', '500', 1),
    day('2026-10-06', '1300', 2),
  ],
  total: '2000',
}
const TOP: TopProducts = {
  from: '2026-09-07',
  to: '2026-10-06',
  items: [
    { productId: 'p1', name: 'Silk Panjabi', slug: 'silk-panjabi', unitsSold: 3, revenue: '10470' },
    { productId: null, name: 'Old Tee', slug: null, unitsSold: 2, revenue: '1000' },
  ],
}
const LOW = {
  items: [
    {
      variantId: 'v1',
      sku: 'OXF-M-BLU',
      size: 'M',
      color: 'Blue',
      stock: 0,
      threshold: 5,
      product: { id: 'p', name: 'Oxford Shirt', slug: 'oxford-shirt' },
    },
  ],
  total: 1,
  threshold: 5,
}

let replace: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetAllMocks()
  replace = vi.fn()
  vi.stubGlobal('location', { ...window.location, replace, pathname: '/admin/dashboard' })
  mocked.fetchSummary.mockResolvedValue(ok(SUMMARY))
  mocked.fetchRevenue.mockResolvedValue(ok(REVENUE))
  mocked.fetchTopProducts.mockResolvedValue(ok(TOP))
  mocked.fetchLowStock.mockResolvedValue(ok(LOW))
})

const section = (name: string) => screen.getByRole('region', { name })

describe('Dashboard', () => {
  it('KPI cards: values, and the change vs the week before in words (not colour alone)', async () => {
    render(<Dashboard />)
    const today = (await screen.findByText('Sales today')).closest('li')!
    expect(today).toHaveTextContent('Sales today৳1,3002 orders')
    expect(screen.getByText('Sales, last 7 days').closest('li')).toHaveTextContent('৳2,000')
    expect(screen.getByText(/down 20% vs the week before/)).toBeInTheDocument() // 2000 vs 2500
    expect(screen.getByText(/down 60% vs the week before/)).toBeInTheDocument() // ৳500 vs ৳1,250 average
    expect(screen.getByText('nothing the week before')).toBeInTheDocument() // 3 new vs 0
    expect(mocked.fetchRevenue).toHaveBeenCalledWith(7)
    expect(mocked.fetchTopProducts).toHaveBeenCalledWith(30, 5)
  })

  it('needs attention: the waiting work, in plain words', async () => {
    render(<Dashboard />)
    await screen.findByText('Sales today')
    const box = section('Needs attention')
    expect(within(box).getByText('cash-on-delivery orders to confirm by phone')).toBeInTheDocument()
    expect(within(box).getAllByText('2')).toHaveLength(1)
  })

  it('needs attention: each waiting line opens the matching order list (not when it is 0)', async () => {
    render(<Dashboard />)
    await screen.findByText('Sales today')
    const box = section('Needs attention')
    expect(
      within(box).getByRole('link', { name: /cash-on-delivery orders to confirm/ }),
    ).toHaveAttribute('href', '/admin/orders?status=PENDING&paymentMethod=COD')
    expect(within(box).getByRole('link', { name: /to pack and ship/ })).toHaveAttribute(
      'href',
      '/admin/orders?status=CONFIRMED,PROCESSING',
    )
    expect(within(box).queryByRole('link', { name: /payments to check/ })).not.toBeInTheDocument() // 0 waiting
    expect(within(box).queryByRole('link', { name: /return requests/ })).not.toBeInTheDocument() // page in step 35
  })

  it('needs attention: all zero → "All caught up"', async () => {
    mocked.fetchSummary.mockResolvedValue(
      ok({
        ...SUMMARY,
        needsAttention: { codToConfirm: 0, toShip: 0, paymentsToReview: 0, returnRequests: 0 },
      }),
    )
    render(<Dashboard />)
    expect(await screen.findByText(/All caught up/)).toBeInTheDocument()
  })

  it('chart: one focusable bar per day; focus shows that day in the tooltip', async () => {
    render(<Dashboard />)
    const chart = await screen.findByRole('group', { name: /Sales per day/ })
    const bars = within(chart).getAllByLabelText(/: ৳/)
    expect(bars).toHaveLength(7)
    expect(bars[6]).toHaveAccessibleName('Tuesday 6 October: ৳1,300 from 2 orders')
    fireEvent.focus(bars[5]!)
    expect(within(chart).getByText('Mon 5 · 1 order')).toBeInTheDocument()
  })

  it('chart: only the best day carries a value label', async () => {
    render(<Dashboard />)
    const chart = await screen.findByRole('group', { name: /Sales per day/ })
    expect(within(chart).getByText('৳1,300')).toBeInTheDocument()
    expect(within(chart).queryByText('৳200')).not.toBeInTheDocument() // only via tooltip / table
  })

  it('chart: the table view has every day and the total', async () => {
    render(<Dashboard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show as table' }))
    const table = screen.getByRole('table', { name: 'Sales per day' })
    expect(within(table).getAllByRole('row')).toHaveLength(9) // header + 7 days + total
    expect(within(table).getByText('Wednesday 30 September')).toBeInTheDocument()
    expect(within(table).getByText('Total').closest('tr')).toHaveTextContent('Total4৳2,000')
  })

  it('chart: a week without sales says so instead of drawing an empty chart', async () => {
    mocked.fetchRevenue.mockResolvedValue(
      ok({ days: REVENUE.days.map((d) => ({ ...d, revenue: '0', orders: 0 })), total: '0' }),
    )
    render(<Dashboard />)
    expect(await screen.findByText('No sales in these 7 days yet.')).toBeInTheDocument()
  })

  it('top products and low stock', async () => {
    render(<Dashboard />)
    await screen.findByText('Silk Panjabi')
    expect(within(section('Top products')).getByText('(deleted)')).toBeInTheDocument()
    expect(
      within(section('Top products')).getByText(/^7 Sept? – 6 Oct · by units sold$/),
    ).toBeInTheDocument()
    const low = section('Low stock')
    expect(within(low).getByText('Oxford Shirt')).toBeInTheDocument()
    expect(within(low).getByText('Sold out')).toBeInTheDocument()
  })

  it('one box failing shows its own error + "Try again"; the rest still works', async () => {
    mocked.fetchTopProducts.mockResolvedValueOnce(failed(500)).mockResolvedValueOnce(ok(TOP))
    render(<Dashboard />)
    const box = section('Top products')
    expect(await within(box).findByRole('alert')).toHaveTextContent(/Couldn’t load this/)
    expect(await screen.findByText('Sales today')).toBeInTheDocument() // the rest is fine
    fireEvent.click(within(box).getByRole('button', { name: 'Try again' }))
    expect(await within(box).findByText('Silk Panjabi')).toBeInTheDocument()
  })

  it('the session ran out while the page was open → back to sign-in', async () => {
    mocked.fetchSummary.mockResolvedValue(failed(401, 'Please sign in.'))
    render(<Dashboard />)
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/admin/login?next=%2Fadmin%2Fdashboard'),
    )
  })
})

describe('niceTicks', () => {
  it('clean steps from 0 to just above the highest value', () => {
    expect(niceTicks(3400)).toEqual([0, 1000, 2000, 3000, 4000])
    expect(niceTicks(1300)).toEqual([0, 500, 1000, 1500])
    expect(niceTicks(10470)).toEqual([0, 5000, 10000, 15000])
    expect(niceTicks(1)).toEqual([0, 0.5, 1])
  })
})
