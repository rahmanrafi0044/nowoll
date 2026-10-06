import type {
  AccountOrderDetailView,
  AccountView,
  SavedAddressView,
  WishlistEntryView,
} from '@nowoll/types'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AddressStep } from '@/components/checkout/address-step'
import { WishlistButton } from '@/components/product/wishlist-button'
import { useCartStore } from '@/stores/cart-store'
import { useCheckoutStore } from '@/stores/checkout-store'
import { useSessionStore } from '@/stores/session-store'
import { AddressBook } from './address-book'
import { MyOrder } from './my-order'
import { MyOrders } from './my-orders'
import { ProfileSettings } from './profile-settings'
import { WishlistPage } from './wishlist-page'

const RAFI: AccountView = {
  id: 'u1',
  email: 'rafi@example.com',
  fullName: 'Rafi Rahman',
  phone: '+8801712345678',
}

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let routes: Record<string, () => [number, object]> = {}
const ok = (data: unknown): [number, object] => [200, { success: true, data }]
const fail = (status: number, error: string, message: string): [number, object] => [
  status,
  { success: false, error, message },
]

beforeEach(() => {
  calls = []
  routes = {}
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      const method = init.method ?? 'GET'
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
      const path = url.replace(/^.*\/api\/v1/, '')
      const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k))
      const [status, body] = key ? routes[key]!() : fail(404, 'NOT_FOUND', 'Not found')
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    }),
  )
  vi.stubGlobal('location', {
    ...window.location,
    replace: vi.fn(),
    assign: vi.fn(),
    pathname: '/account/orders',
  })
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  )
  useSessionStore.setState({ status: 'signed-in', user: RAFI })
})
afterEach(() => vi.unstubAllGlobals())

const called = (method: string, path: string) =>
  calls.filter((c) => c.method === method && c.url.endsWith(path))

const summary = (n: number) => ({
  displayNumber: `NW-${n}`,
  placedAt: '2026-10-05T04:00:00.000Z',
  status: 'PENDING',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  total: '1550',
  itemCount: 1,
  imageUrls: [],
})

describe('my orders', () => {
  it('each order links to its own page by number; long histories page', async () => {
    routes['GET /orders/my?page=1'] = () =>
      ok({
        items: [summary(10002), summary(10001)],
        total: 12,
        page: 1,
        pageSize: 10,
        totalPages: 2,
      })
    routes['GET /orders/my?page=2'] = () =>
      ok({ items: [summary(10000)], total: 12, page: 2, pageSize: 10, totalPages: 2 })
    render(<MyOrders />)
    expect(await screen.findByRole('link', { name: /NW-10002/ })).toHaveAttribute(
      'href',
      '/account/orders/NW-10002',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Older' }))
    expect(await screen.findByRole('link', { name: /NW-10000/ })).toBeVisible()
  })

  it('empty: points guests-orders to tracking', async () => {
    routes['GET /orders/my'] = () =>
      ok({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })
    render(<MyOrders />)
    expect(await screen.findByText('No orders yet.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Track it with its number' })).toHaveAttribute(
      'href',
      '/orders/track',
    )
  })

  it('a dead session goes to sign-in and back', async () => {
    routes['GET /orders/my'] = () => fail(401, 'NOT_SIGNED_IN', 'Please sign in.')
    render(<MyOrders />)
    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith('/login?next=%2Faccount%2Forders'),
    )
  })

  const detail = (over: Partial<AccountOrderDetailView> = {}): AccountOrderDetailView => ({
    orderId: 'o1',
    displayNumber: 'NW-10001',
    placedAt: '2026-10-05T04:00:00.000Z',
    status: 'SHIPPED',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    items: [
      {
        productName: 'Oxford Shirt',
        variantLabel: 'M / Blue',
        imageUrl: null,
        unitPrice: '1490',
        quantity: 1,
        lineTotal: '1490',
      },
    ],
    total: '1550',
    canPay: false,
    customerName: 'Rafi Rahman',
    deliveryAddress: {
      addressLine1: 'House 12',
      addressLine2: null,
      area: 'Dhanmondi',
      district: 'Dhaka',
      division: 'Dhaka',
      postalCode: null,
    },
    deliveryZone: 'Inside Dhaka',
    totals: {
      subtotal: '1490',
      discount: '0',
      discountCode: null,
      shippingFee: '60',
      vatRate: '0',
      vatAmount: '0',
      total: '1550',
    },
    courierName: 'Steadfast',
    trackingNumber: 'SF1',
    timeline: [
      { status: 'PENDING', at: '2026-10-05T04:00:00.000Z' },
      { status: 'SHIPPED', at: '2026-10-06T04:00:00.000Z' },
    ],
    ...over,
  })

  it('one order: progress, courier, full receipt', async () => {
    routes['GET /orders/my/NW-10001'] = () => ok(detail())
    render(<MyOrder number="NW-10001" />)
    expect(await screen.findByRole('heading', { name: 'Order NW-10001' })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Order progress' })).toBeVisible()
    expect(screen.getByText(/Sent with/)).toHaveTextContent('Steadfast — tracking number SF1')
    expect(screen.getByText('House 12, Dhanmondi, Dhaka, Dhaka')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Pay now/ })).toBeNull()
  })

  it('an unpaid online order offers "Pay now"; a missing one says so', async () => {
    routes['GET /orders/my/NW-10001'] = () =>
      ok(detail({ status: 'PENDING', paymentMethod: 'SSLCOMMERZ', canPay: true }))
    const { unmount } = render(<MyOrder number="NW-10001" />)
    expect(await screen.findByRole('button', { name: /Pay now — ৳1,550/ })).toBeVisible()
    unmount()
    render(<MyOrder number="NW-99999" />)
    expect(await screen.findByRole('heading', { name: 'Order not found' })).toBeVisible()
  })
})

describe('wishlist', () => {
  const entry = (over: Partial<WishlistEntryView> = {}): WishlistEntryView => ({
    variantId: 'v1',
    productId: 'p1',
    sku: 'S1',
    productName: 'Oxford Shirt',
    productSlug: 'oxford-shirt',
    size: 'M',
    color: 'Blue',
    price: '1490',
    compareAtPrice: '1990',
    imageUrl: null,
    inStock: true,
    savedAt: '2026-10-05T04:00:00.000Z',
    ...over,
  })

  beforeEach(() => act(() => useCartStore.getState().clear()))

  it('lists saved items; "Add to bag" puts the exact size in the bag; sold out can\'t be added', async () => {
    routes['GET /wishlist'] = () =>
      ok([entry(), entry({ variantId: 'v2', size: 'L', inStock: false })])
    render(<WishlistPage />)
    const [m, l] = await screen.findAllByRole('listitem')
    expect(within(m!).getByText('-25%')).toBeVisible()
    fireEvent.click(within(m!).getByRole('button', { name: 'Add to bag' }))
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({
        variantId: 'v1',
        variantLabel: 'M / Blue',
        unitPrice: 1490,
        quantity: 1,
      }),
    ])
    expect(within(l!).getByText('Sold out')).toBeVisible()
    expect(within(l!).getByRole('button', { name: 'Add to bag' })).toBeDisabled()
  })

  it('remove takes it off at once and tells the API', async () => {
    routes['GET /wishlist'] = () => ok([entry()])
    routes['DELETE /wishlist/v1'] = () => ok({ removed: true })
    render(<WishlistPage />)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Remove Oxford Shirt (M / Blue) from your wishlist',
      }),
    )
    expect(screen.queryByText('Oxford Shirt')).toBeNull()
    await waitFor(() => expect(called('DELETE', '/wishlist/v1')).toHaveLength(1))
  })

  it('product page heart: guests are offered sign-in, back to this product', () => {
    useSessionStore.setState({ status: 'signed-out', user: null })
    render(<WishlistButton variantId="v1" productSlug="oxford-shirt" />)
    expect(screen.getByRole('link', { name: /Sign in to save items/ })).toHaveAttribute(
      'href',
      '/login?next=%2Fproducts%2Foxford-shirt',
    )
  })

  it('product page heart: needs a size; then saves it and can un-save it', async () => {
    routes['GET /wishlist'] = () => ok([])
    routes['POST /wishlist'] = () => ok({ saved: true })
    routes['DELETE /wishlist/v1'] = () => ok({ removed: true })
    const { rerender } = render(<WishlistButton variantId={null} productSlug="oxford-shirt" />)
    fireEvent.click(screen.getByRole('button', { name: /Save for later/ }))
    expect(await screen.findByText('Choose a size first.')).toBeVisible()
    expect(called('POST', '/wishlist')).toEqual([])

    rerender(<WishlistButton variantId="v1" productSlug="oxford-shirt" />)
    fireEvent.click(screen.getByRole('button', { name: /Save for later/ }))
    expect(await screen.findByRole('button', { name: /Saved — remove/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(called('POST', '/wishlist')[0]!.body).toEqual({ variantId: 'v1' })
    fireEvent.click(screen.getByRole('button', { name: /Saved — remove/ }))
    expect(await screen.findByRole('button', { name: /Save for later/ })).toBeVisible()
  })
})

describe('addresses', () => {
  const home: SavedAddressView = {
    id: 'a1',
    label: 'Home',
    fullName: 'Rafi Rahman',
    phone: '+8801712345678',
    addressLine1: 'House 12, Road 5',
    addressLine2: null,
    area: 'Dhanmondi',
    district: 'Dhaka',
    division: 'Dhaka',
    postalCode: null,
    isDefault: true,
  }
  const office = {
    ...home,
    id: 'a2',
    label: 'Office',
    addressLine1: 'Level 4',
    area: 'Gulshan',
    isDefault: false,
  }

  it('lists with the default marked; make default, delete (after confirming)', async () => {
    routes['GET /addresses'] = () => ok([home, office])
    routes['PATCH /addresses/a2'] = () => ok({ ...office, isDefault: true })
    routes['DELETE /addresses/a2'] = () => ok({ deleted: true })
    render(<AddressBook />)
    expect(await screen.findByText('Default')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Make Office the default' }))
    await waitFor(() =>
      expect(called('PATCH', '/addresses/a2')[0]!.body).toEqual({ isDefault: true }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete Office' }))
    await waitFor(() => expect(called('DELETE', '/addresses/a2')).toHaveLength(1))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('adding: shared rules first, then a clean, normalised body', async () => {
    routes['GET /addresses'] = () => ok([])
    routes['POST /addresses'] = () => ok(home)
    render(<AddressBook />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add an address' }))
    fireEvent.change(screen.getByLabelText('Recipient’s mobile number'), {
      target: { value: '12345' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    expect(screen.getByText(/valid Bangladeshi mobile/)).toBeVisible()
    expect(called('POST', '/addresses')).toEqual([])

    fireEvent.change(screen.getByLabelText('Recipient’s mobile number'), {
      target: { value: '017 1234-5678' },
    })
    fireEvent.change(screen.getByLabelText(/^Division/), {
      target: { value: 'Dhaka' },
    })
    fireEvent.change(screen.getByLabelText(/^District/), {
      target: { value: 'Dhaka' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /^Address$/ }), {
      target: { value: ' House 12 ' },
    })
    expect(screen.getByLabelText('Use as my default address')).toBeChecked() // the first one always is
    fireEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() =>
      expect(called('POST', '/addresses')[0]!.body).toEqual({
        label: null,
        fullName: 'Rafi Rahman', // starts from the account
        phone: '+8801712345678',
        division: 'Dhaka',
        district: 'Dhaka',
        addressLine1: 'House 12',
        area: null,
        addressLine2: null,
        postalCode: null,
        isDefault: true,
      }),
    )
  })

  describe('at checkout (signed in)', () => {
    beforeEach(() => act(() => useCheckoutStore.getState().reset()))

    it('starts from the default saved address; continuing uses it', async () => {
      routes['GET /addresses'] = () => ok([home, office])
      render(<AddressStep />)
      expect(await screen.findByRole('radio', { name: /Home/ })).toBeChecked()
      expect(screen.queryByLabelText('Area / thana')).toBeNull() // no form while a saved one is picked
      fireEvent.click(screen.getByRole('radio', { name: /Office/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Continue to delivery' }))
      expect(useCheckoutStore.getState()).toMatchObject({
        address: { addressLine1: 'Level 4', area: 'Gulshan', district: 'Dhaka' },
        saveAddress: false,
      })
    })

    it('"A new address" shows the form with "Save to my addresses" ticked', async () => {
      routes['GET /addresses'] = () => ok([home])
      act(() =>
        useCheckoutStore.getState().setContact({
          fullName: 'Rafi Rahman',
          email: 'rafi@example.com',
          phone: '+8801712345678',
        }),
      )
      render(<AddressStep />)
      fireEvent.click(await screen.findByRole('radio', { name: /A new address/ }))
      expect(screen.getByLabelText('Save to my addresses')).toBeChecked()
      fireEvent.change(screen.getByLabelText(/^Division/), {
        target: { value: 'Dhaka' },
      })
      fireEvent.change(screen.getByLabelText(/^District/), {
        target: { value: 'Dhaka' },
      })
      fireEvent.change(screen.getByRole('textbox', { name: /^Address$/ }), {
        target: { value: 'Flat 3B' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Continue to delivery' }))
      expect(useCheckoutStore.getState()).toMatchObject({
        address: { addressLine1: 'Flat 3B' },
        saveAddress: true,
      })
    })
  })
})

describe('profile', () => {
  it('saves name and mobile; a wrong current password is reported', async () => {
    routes['PATCH /auth/me'] = () => ok({ user: { ...RAFI, fullName: 'Rafi R.' } })
    routes['POST /auth/change-password'] = () =>
      fail(400, 'WRONG_PASSWORD', 'Your current password is not correct.')
    render(<ProfileSettings />)
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' Rafi R. ' } })
    fireEvent.change(screen.getByLabelText('Mobile number (optional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByText('Saved.')).toBeVisible()
    expect(called('PATCH', '/auth/me')[0]!.body).toEqual({ fullName: 'Rafi R.', phone: null })
    expect(useSessionStore.getState().user?.fullName).toBe('Rafi R.')

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'nope' } })
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'brand-new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your current password is not correct.',
    )
  })
})
