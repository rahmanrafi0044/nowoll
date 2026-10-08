import type { AdminCustomerDetail, AdminCustomerRow, AdminOrderRow } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { parseCustomerFilters } from '@/lib/customer-filters'
import * as api from '@/lib/customers-api'
import { CustomerDetail } from './customer-detail'
import { CustomerList } from './customer-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/customers',
}))
vi.mock('@/lib/customers-api', () => ({
  fetchCustomers: vi.fn(),
  fetchCustomer: vi.fn(),
  banCustomer: vi.fn(),
  unbanCustomer: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const ROW: AdminCustomerRow = {
  id: 'u1',
  name: 'Rafi Rahman',
  email: 'rafi@example.com',
  phone: '+8801712345678',
  status: 'ACTIVE',
  joinedAt: '2026-10-01T04:00:00Z',
  orderCount: 3,
  totalSpent: '4580',
  lastOrderAt: '2026-10-05T18:30:00Z',
}
const order = (id: string, number: string): AdminOrderRow => ({
  id,
  number,
  status: 'DELIVERED',
  paymentMethod: 'COD',
  paymentStatus: 'PAID',
  customerName: 'Rafi',
  phone: '+8801712345678',
  email: 'rafi@example.com',
  district: 'Dhaka',
  itemCount: 1,
  total: '1060',
  createdAt: '2026-10-05T18:30:00Z',
})
const DETAIL: AdminCustomerDetail = {
  id: 'u1',
  name: 'Rafi Rahman',
  email: 'rafi@example.com',
  phone: '+8801712345678',
  status: 'ACTIVE',
  joinedAt: '2026-10-01T04:00:00Z',
  ban: null,
  stats: {
    orderCount: 1,
    totalSpent: '1060',
    averageOrder: '1060',
    firstOrderAt: '2026-10-05T18:30:00Z',
    lastOrderAt: '2026-10-05T18:30:00Z',
    reviewCount: 2,
    returnCount: 0,
  },
  addresses: [
    {
      id: 'a1',
      label: 'Home',
      fullName: 'Rafi',
      phone: '+8801712345678',
      line1: 'House 12',
      line2: null,
      area: 'Dhanmondi',
      district: 'Dhaka',
      division: 'Dhaka',
      isDefault: true,
    },
  ],
  orders: [order('o1', 'NW-10001')],
  guestOrders: [order('o9', 'NW-10009')],
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchCustomers.mockResolvedValue(
    ok({ items: [ROW], total: 1, page: 1, pageSize: 25, totalPages: 1 }),
  )
  mocked.fetchCustomer.mockResolvedValue(ok(DETAIL))
})
const card = (name: string) => screen.getByRole('region', { name })
const open = async () => {
  render(<CustomerDetail id="u1" />)
  await screen.findByRole('heading', { name: 'Rafi Rahman' })
}

describe('CustomerList', () => {
  it('rows: name link, contact, joined, orders, spent, last order, status', async () => {
    render(<CustomerList filters={{}} />)
    const link = await screen.findByRole('link', { name: 'Rafi Rahman' })
    expect(link).toHaveAttribute('href', '/admin/customers/u1')
    const row = link.closest('tr')!
    expect(row).toHaveTextContent('rafi@example.com · +8801712345678')
    expect(row).toHaveTextContent('1 Oct 2026')
    expect(row).toHaveTextContent('৳4,580')
    expect(row).toHaveTextContent('6 Oct 2026')
    expect(row).toHaveTextContent('Active')
  })

  it('filters and sort → the page address', async () => {
    render(<CustomerList filters={{ page: 2 }} />)
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'BANNED' } })
    expect(push).toHaveBeenLastCalledWith('/admin/customers?status=BANNED')
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'spent' } })
    expect(push).toHaveBeenLastCalledWith('/admin/customers?sort=spent')
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'newest' } })
    expect(push).toHaveBeenLastCalledWith('/admin/customers') // the default isn't written
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: ' 01712 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(push).toHaveBeenLastCalledWith('/admin/customers?q=01712')
  })

  it('parseCustomerFilters keeps known values only', () => {
    expect(parseCustomerFilters({ status: 'BANNED', sort: 'orders', page: '2' })).toEqual({
      q: undefined,
      status: 'BANNED',
      sort: 'orders',
      page: 2,
    })
    expect(parseCustomerFilters({ status: 'deleted', sort: 'random' })).toMatchObject({
      status: undefined,
      sort: undefined,
    })
  })
})

describe('CustomerDetail', () => {
  it('stats, their orders (linked), guest orders in a separate staff-only box, contact, addresses', async () => {
    await open()
    const orders = card('Orders')
    expect(orders).toHaveTextContent('Orders1')
    expect(orders).toHaveTextContent('Spent৳1,060')
    expect(orders).toHaveTextContent('Reviews2')
    expect(within(orders).getByRole('link', { name: 'NW-10001' })).toHaveAttribute(
      'href',
      '/admin/orders/o1',
    )
    const guests = card('Guest orders with the same email or phone')
    expect(guests).toHaveTextContent('Staff only')
    expect(within(guests).getByRole('link', { name: 'NW-10009' })).toBeInTheDocument()
    expect(within(card('Contact')).getByRole('link', { name: '+8801712345678' })).toHaveAttribute(
      'href',
      'tel:+8801712345678',
    )
    expect(card('Saved addresses')).toHaveTextContent('Home(default)')
  })

  it('ban: explains what it does; a reason is required; then the API is called', async () => {
    mocked.banCustomer.mockResolvedValue(ok(DETAIL))
    await open()
    const account = card('Account')
    fireEvent.click(within(account).getByRole('button', { name: 'Ban this customer…' }))
    expect(account).toHaveTextContent('refuses checkout with this email or phone')
    fireEvent.click(within(account).getByRole('button', { name: 'Ban customer' }))
    expect(within(account).getByRole('alert')).toHaveTextContent('Give a reason')
    expect(mocked.banCustomer).not.toHaveBeenCalled()
    fireEvent.change(within(account).getByLabelText('Reason'), {
      target: { value: ' Refused 3 parcels ' },
    })
    mocked.fetchCustomer.mockResolvedValue(
      ok({
        ...DETAIL,
        status: 'BANNED',
        ban: { reason: 'Refused 3 parcels', at: '2026-10-07T10:00:00Z', by: 'Rafi' },
      }),
    )
    fireEvent.click(within(account).getByRole('button', { name: 'Ban customer' }))
    await waitFor(() => expect(mocked.banCustomer).toHaveBeenCalledWith('u1', 'Refused 3 parcels'))
    expect(await within(card('Account')).findByText('Refused 3 parcels')).toBeInTheDocument()
    expect(card('Account')).toHaveTextContent('Banned 7 Oct 2026 by Rafi')
  })

  it('banned: shows who, when and why, and unban', async () => {
    mocked.fetchCustomer.mockResolvedValue(
      ok({
        ...DETAIL,
        status: 'BANNED',
        ban: { reason: 'Fake orders', at: '2026-10-07T10:00:00Z', by: null },
      }),
    )
    mocked.unbanCustomer.mockResolvedValue(ok(DETAIL))
    await open()
    expect(card('Account')).toHaveTextContent('Banned 7 Oct 2026')
    expect(card('Account')).toHaveTextContent('Fake orders')
    fireEvent.click(within(card('Account')).getByRole('button', { name: 'Unban' }))
    await waitFor(() => expect(mocked.unbanCustomer).toHaveBeenCalledWith('u1'))
  })

  it('no orders, no addresses → says so', async () => {
    mocked.fetchCustomer.mockResolvedValue(
      ok({ ...DETAIL, orders: [], guestOrders: [], addresses: [], phone: null }),
    )
    await open()
    expect(card('Orders')).toHaveTextContent('No orders from this account yet.')
    expect(card('Guest orders with the same email or phone')).toHaveTextContent('None.')
    expect(card('Contact')).toHaveTextContent('No phone saved')
  })
})
