import type {
  CustomersReport,
  OrdersReport,
  RevenueSeries,
  TopCategories,
  TopProducts,
} from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/analytics-api'
import { parsePeriod } from '@/lib/analytics-period'
import { AnalyticsPage } from './analytics-page'
import { pointLabel } from './sales-trend'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/analytics-api', () => ({
  fetchRevenueFor: vi.fn(),
  fetchTopProductsFor: vi.fn(),
  fetchTopCategoriesFor: vi.fn(),
  fetchCustomersFor: vi.fn(),
  fetchOrdersFor: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })
const failed = { ok: false as const, status: 500, message: 'The server had a problem.' }

const PERIOD = parsePeriod({ range: 'last7' }, new Date('2026-10-06T06:00:00Z')) // 30 Sep – 6 Oct
const point = (start: string, revenue: string, orders: number) => ({
  start,
  end: start,
  revenue,
  orders,
})
const REVENUE: RevenueSeries = {
  from: '2026-09-30',
  to: '2026-10-06',
  days: [],
  groupBy: 'day',
  points: [
    point('2026-09-30', '1000', 1),
    point('2026-10-01', '0', 0),
    point('2026-10-02', '0', 0),
    point('2026-10-03', '500', 1),
    point('2026-10-04', '0', 0),
    point('2026-10-05', '0', 0),
    point('2026-10-06', '2500', 2),
  ],
  total: '4000',
  orders: 4,
  previous: { from: '2026-09-23', to: '2026-09-29', revenue: '5000', orders: 4 },
}
const PREVIOUS: RevenueSeries = {
  ...REVENUE,
  from: '2026-09-23',
  to: '2026-09-29',
  points: REVENUE.points.map((p, i) => ({
    ...p,
    start: `2026-09-2${3 + i}`,
    end: `2026-09-2${3 + i}`,
  })),
  total: '5000',
}
const TOP: TopProducts = {
  from: '2026-09-30',
  to: '2026-10-06',
  items: [
    { productId: 'p1', name: 'Oxford Shirt', slug: 'oxford', unitsSold: 6, revenue: '8940' },
    { productId: null, name: 'Old Panjabi', slug: null, unitsSold: 3, revenue: '3600' },
  ],
}
const CATS: TopCategories = {
  from: '2026-09-30',
  to: '2026-10-06',
  level: 'category',
  items: [
    { categoryId: 'c1', name: 'Shirts', path: 'Men > Shirts', unitsSold: 6, revenue: '7500' },
    {
      categoryId: null,
      name: 'Unknown category',
      path: 'Unknown category',
      unitsSold: 1,
      revenue: '2500',
    },
  ],
  total: '10000',
  previousTotal: '8000',
}
const CUSTOMERS: CustomersReport = {
  from: '2026-09-30',
  to: '2026-10-06',
  customers: 3,
  newCustomers: 2,
  returningCustomers: 1,
  repeatRate: 33.3,
  previous: { customers: 3, newCustomers: 1 },
  topCustomers: [
    { email: 'rafi@example.com', name: 'Rafi', userId: 'u1', orders: 2, spent: '3000' },
    { email: 'mita@example.com', name: 'Mita', userId: null, orders: 1, spent: '1000' },
  ],
}
const ORDERS: OrdersReport = {
  from: '2026-09-30',
  to: '2026-10-06',
  placed: 10,
  outcomes: { sale: 4, delivered: 2, pending: 3, cancelled: 2, returned: 1 },
  cancellationRate: 20,
  previous: { placed: 8, cancellationRate: 25 },
  byPaymentMethod: [
    { method: 'COD', orders: 3, revenue: '3000' },
    { method: 'SSLCOMMERZ', orders: 1, revenue: '1000' },
  ],
  byZone: [{ zone: 'Inside Dhaka', orders: 4, revenue: '4000' }],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchRevenueFor.mockImplementation(async (p) =>
    ok(p.from === '2026-09-23' ? PREVIOUS : REVENUE),
  )
  mocked.fetchTopProductsFor.mockResolvedValue(ok(TOP))
  mocked.fetchTopCategoriesFor.mockResolvedValue(ok(CATS))
  mocked.fetchCustomersFor.mockResolvedValue(ok(CUSTOMERS))
  mocked.fetchOrdersFor.mockResolvedValue(ok(ORDERS))
})

const tile = async (label: string) =>
  (await within(await screen.findByRole('list', { name: 'Summary' })).findByText(label)).closest(
    'li',
  )!

describe('Admin → Analytics (step 41)', () => {
  it('asks the API for the chosen period, and shows it', async () => {
    render(<AnalyticsPage period={PERIOD} />)
    await screen.findByText(/Oxford Shirt/)
    const dates = { from: '2026-09-30', to: '2026-10-06' }
    expect(mocked.fetchRevenueFor).toHaveBeenCalledWith(dates)
    expect(mocked.fetchOrdersFor).toHaveBeenCalledWith(dates)
    expect(mocked.fetchCustomersFor).toHaveBeenCalledWith(dates)
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText(/30 Sept? – 6 Oct 2026/)).toBeInTheDocument()
  })

  it('tiles: change vs the previous period; for cancellations, down is good', async () => {
    render(<AnalyticsPage period={PERIOD} />)
    expect(await tile('Sales')).toHaveTextContent(/৳4,000.*▼ 20%.*vs previous period/)
    expect((await tile('Sales')).querySelector('.text-danger')).not.toBeNull()
    expect(await tile('Customers')).toHaveTextContent(/3.*2 new · 1 returning.*no change/)
    const cancelled = await tile('Cancelled')
    expect(cancelled).toHaveTextContent(/20%.*2 of 10 placed.*▼ 5 points/)
    expect(cancelled.querySelector('.text-success')).not.toBeNull() // fewer cancellations = good
  })

  it('choosing a preset or custom dates changes the address; bad dates are explained', async () => {
    render(<AnalyticsPage period={PERIOD} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Last month' }))
    expect(push).toHaveBeenCalledWith('/admin/analytics?range=lastMonth')
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))
    expect(push).toHaveBeenLastCalledWith('/admin/analytics')

    fireEvent.click(screen.getByRole('button', { name: 'Custom dates' }))
    const form = screen.getByRole('form', { name: 'Custom dates' })
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2026-10-05' } })
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: '2026-10-01' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Show' }))
    expect(within(form).getByRole('alert')).toHaveTextContent(/on or before/)
    fireEvent.change(within(form).getByLabelText('To'), { target: { value: '2026-10-09' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Show' }))
    expect(push).toHaveBeenLastCalledWith('/admin/analytics?from=2026-10-05&to=2026-10-09')
  })

  it('chart: legend with both totals; arrow keys read each point with the previous period', async () => {
    render(<AnalyticsPage period={PERIOD} />)
    const legend = await screen.findByRole('list', { name: 'Legend' })
    await waitFor(() =>
      expect(legend).toHaveTextContent(/This period ৳4,000.*Previous period ৳5,000/),
    )
    expect(mocked.fetchRevenueFor).toHaveBeenCalledWith(
      { from: '2026-09-23', to: '2026-09-29' },
      'day',
    )
    const chart = screen.getByRole('group', { name: /Sales per day/ })
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    // The 2nd point (1 Oct), read aloud for screen readers.
    expect(screen.getByText(/1 Oct: ৳0, 0 orders/)).toBeInTheDocument()
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(screen.getByText(/30 Sept?: ৳1,000, 1 order$/)).toBeInTheDocument()
  })

  it('chart: every value is also in the table view', async () => {
    render(<AnalyticsPage period={PERIOD} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show as table' }))
    const rows = screen.getAllByRole('row')
    expect(rows.find((r) => /6 Oct/.test(r.textContent ?? ''))).toHaveTextContent(
      /6 Oct2৳2,500৳2,500/,
    )
    expect(rows.find((r) => /^Total/.test(r.textContent ?? ''))).toHaveTextContent(
      'Total4৳4,000৳5,000',
    )
  })

  it('chart grouping: by week asks again for both periods', async () => {
    render(<AnalyticsPage period={PERIOD} />)
    fireEvent.click(await screen.findByRole('button', { name: 'By week' }))
    await waitFor(() => expect(mocked.fetchRevenueFor).toHaveBeenCalledWith(REVENUE, 'week'))
    expect(mocked.fetchRevenueFor).toHaveBeenCalledWith(
      { from: '2026-09-23', to: '2026-09-29' },
      'week',
    )
  })

  it('over 92 days: one point per day would be unreadable, so "By day" is not offered', async () => {
    const long: RevenueSeries = {
      ...REVENUE,
      days: Array.from({ length: 120 }, (_, k) => ({ date: `d${k}`, revenue: '0', orders: 0 })),
      groupBy: 'week',
    }
    mocked.fetchRevenueFor.mockResolvedValue(ok(long))
    render(<AnalyticsPage period={PERIOD} />)
    const groups = await screen.findByRole('group', { name: 'Group the chart' })
    expect(within(groups).getByRole('button', { name: 'By week' })).toBeInTheDocument()
    expect(within(groups).queryByRole('button', { name: 'By day' })).toBeNull()
  })

  it('no sales → says so instead of an empty chart', async () => {
    const zero = {
      ...REVENUE,
      points: REVENUE.points.map((p) => ({ ...p, revenue: '0', orders: 0 })),
      total: '0',
    }
    mocked.fetchRevenueFor.mockResolvedValue(ok(zero))
    render(<AnalyticsPage period={PERIOD} />)
    expect(await screen.findByText('No sales in this period.')).toBeInTheDocument()
  })

  it('top products and categories: links, deleted ones marked, shares, category level switch', async () => {
    render(<AnalyticsPage period={PERIOD} />)
    expect(await screen.findByRole('link', { name: 'Oxford Shirt' })).toHaveAttribute(
      'href',
      '/admin/products/p1',
    )
    expect(screen.getByText('Old Panjabi (deleted)')).toBeInTheDocument()
    const cats = screen.getByRole('region', { name: 'Top categories' })
    expect(within(cats).getByText('Men > Shirts').closest('tr')).toHaveTextContent('৳7,50075%')
    fireEvent.click(within(cats).getByRole('button', { name: 'Top level' }))
    await waitFor(() =>
      expect(mocked.fetchTopCategoriesFor).toHaveBeenLastCalledWith(
        { from: '2026-09-30', to: '2026-10-06' },
        'top',
        10,
      ),
    )
  })

  it('orders and customers: outcomes with %, payment and zone splits, top customers', async () => {
    render(<AnalyticsPage period={PERIOD} />)
    const orders = await screen.findByRole('region', { name: 'Orders placed in this period' })
    expect(within(orders).getByText('Cancelled').closest('tr')).toHaveTextContent('Cancelled220%')
    expect(within(orders).getByText('Cash on delivery').closest('tr')).toHaveTextContent(
      /375%৳3,000/,
    )
    const customers = screen.getByRole('region', { name: 'Customers' })
    expect(within(customers).getByRole('link', { name: 'Rafi' })).toHaveAttribute(
      'href',
      '/admin/customers/u1',
    )
    expect(within(customers).getByText('Mita').closest('tr')).toHaveTextContent('(guest)')
    expect(customers).toHaveTextContent(/33.3%.*ordered more than once/)
  })

  it('one box failing never blanks the others', async () => {
    mocked.fetchCustomersFor.mockResolvedValue(failed)
    render(<AnalyticsPage period={PERIOD} />)
    const customers = await screen.findByRole('region', { name: 'Customers' })
    expect(await within(customers).findByRole('alert')).toHaveTextContent('Couldn’t load this')
    expect(await screen.findByText(/Oxford Shirt/)).toBeInTheDocument()
  })
})

describe('chart labels', () => {
  it('a day, a 7-day block, a month', () => {
    expect(pointLabel(point('2026-10-06', '0', 0), 'day')).toMatch(/6 Oct/)
    expect(
      pointLabel({ start: '2026-10-01', end: '2026-10-07', revenue: '0', orders: 0 }, 'week'),
    ).toMatch(/1 Oct – 7 Oct/)
    expect(
      pointLabel({ start: '2026-09-15', end: '2026-09-30', revenue: '0', orders: 0 }, 'month'),
    ).toMatch(/^Sept?$/)
  })
})
