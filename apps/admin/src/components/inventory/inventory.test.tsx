import type { InventoryRow } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/inventory-api'
import { parseInventoryFilters } from '@/lib/inventory-filters'
import * as products from '@/lib/products-api'
import { previewStock } from './adjust-dialog'
import { InventoryList } from './inventory-list'
import { LowStockList } from './low-stock-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/inventory',
}))
vi.mock('@/lib/inventory-api', () => ({
  fetchInventory: vi.fn(),
  fetchLowStockList: vi.fn(),
  adjustStock: vi.fn(),
  fetchStockHistory: vi.fn(),
}))
vi.mock('@/lib/products-api', () => ({ fetchCategories: vi.fn() }))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const row = (over: Partial<InventoryRow> = {}): InventoryRow => ({
  variantId: 'v1',
  sku: 'OXF-M-BLU',
  size: 'M',
  color: 'Blue',
  stock: 12,
  threshold: 5,
  usesStoreThreshold: true,
  isLow: false,
  isActive: true,
  product: { id: 'p1', name: 'Oxford Shirt', slug: 'oxford-shirt', status: 'ACTIVE' },
  category: { name: 'Shirts', slug: 'shirts' },
  ...over,
})
const page = (items: InventoryRow[]) =>
  ok({ items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchInventory.mockResolvedValue(
    page([
      row(),
      row({ variantId: 'v2', size: 'L', stock: 0, isLow: true, sku: 'OXF-L-BLU' }),
      row({
        variantId: 'v3',
        size: 'S',
        stock: 3,
        isLow: true,
        sku: 'OXF-S-BLU',
        product: { id: 'p2', name: 'Draft Tee', slug: 'draft-tee', status: 'DRAFT' },
      }),
    ]),
  )
  vi.mocked(products.fetchCategories).mockResolvedValue(
    ok([
      {
        id: 'c1',
        name: 'Men',
        slug: 'men',
        children: [{ id: 'c2', name: 'Shirts', slug: 'shirts', children: [] }],
      },
    ]),
  )
})

const openAdjust = async (name = 'Change stock of Oxford Shirt M / Blue') => {
  render(<InventoryList filters={{}} />)
  fireEvent.click(await screen.findByRole('button', { name }))
  return screen.getByRole('dialog', { name: 'Change stock' })
}

describe('InventoryList', () => {
  it('rows: product link, size/colour, SKU, stock (sold out / low marked), draft badge', async () => {
    render(<InventoryList filters={{}} />)
    const [link] = await screen.findAllByRole('link', { name: 'Oxford Shirt' }) // M and L rows
    expect(link!).toHaveAttribute('href', '/admin/products/p1')
    const rows = screen.getAllByRole('row')
    expect(rows[2]).toHaveTextContent('Sold out')
    expect(rows[3]).toHaveTextContent('Draft')
    expect(rows[3]).toHaveTextContent('3 (low)')
  })

  it('filters → the page address; category by slug ("Men › Shirts")', async () => {
    render(<InventoryList filters={{ page: 2 }} />)
    await screen.findByRole('table')
    fireEvent.change(await screen.findByLabelText('Category'), { target: { value: 'shirts' } })
    expect(push).toHaveBeenLastCalledWith('/admin/inventory?category=shirts')
    expect(screen.getByRole('option', { name: 'Men › Shirts' })).toHaveValue('shirts')
    fireEvent.click(screen.getByLabelText('Sold out only'))
    expect(push).toHaveBeenLastCalledWith('/admin/inventory?stock=out')
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'name' } })
    expect(push).toHaveBeenLastCalledWith('/admin/inventory?sort=name')
  })

  it('parseInventoryFilters keeps known values only', () => {
    expect(
      parseInventoryFilters({ category: 'shirts', stock: 'out', sort: 'name', page: '2' }),
    ).toEqual({
      q: undefined,
      category: 'shirts',
      stock: 'out',
      sort: 'name',
      page: 2,
    })
    expect(parseInventoryFilters({ category: 'Bad Slug!', stock: 'low', sort: 'x' })).toMatchObject(
      {
        category: undefined,
        stock: undefined,
        sort: undefined,
      },
    )
  })
})

describe('Change stock (dialog)', () => {
  it('opens as a dialog; Close closes it', async () => {
    const dialog = await openAdjust()
    expect(dialog).toHaveTextContent('Now in stock: 12')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Esc (the browser closes the dialog → "close" event) closes it too', async () => {
    const dialog = await openAdjust()
    ;(dialog as HTMLDialogElement).close() // what the browser does on Esc
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // …and the page knows it closed: the same button opens it again.
    fireEvent.click(screen.getByRole('button', { name: 'Change stock of Oxford Shirt M / Blue' }))
    expect(await screen.findByRole('dialog', { name: 'Change stock' })).toBeInTheDocument()
  })

  it('add: shows "12 → 32" before saving; a quick note fills the note; sends change + note', async () => {
    mocked.adjustStock.mockResolvedValue(
      ok({ variantId: 'v1', before: 12, after: 32, change: 20, logId: 'l1' }),
    )
    const dialog = await openAdjust()
    fireEvent.change(within(dialog).getByLabelText('Add (+) or remove (−)'), {
      target: { value: '20' },
    })
    expect(dialog).toHaveTextContent('12 → 32')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Received from supplier' }))
    expect(within(dialog).getByLabelText('Note')).toHaveValue('Received from supplier')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.adjustStock).toHaveBeenCalledWith('v1', {
        change: 20,
        note: 'Received from supplier',
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Oxford Shirt M / Blue: 12 → 32')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocked.fetchInventory).toHaveBeenCalledTimes(2) // reloaded quietly
  })

  it('set the exact count (stock take) sends setTo; the low-stock limit is pointed out', async () => {
    mocked.adjustStock.mockResolvedValue(
      ok({ variantId: 'v1', before: 12, after: 4, change: -8, logId: 'l2' }),
    )
    const dialog = await openAdjust()
    fireEvent.click(within(dialog).getByLabelText('Set the exact count (stock take)'))
    fireEvent.change(within(dialog).getByLabelText('Counted'), { target: { value: '4' } })
    expect(dialog).toHaveTextContent('12 → 4 (at or below the alert limit of 5)')
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'Stock count' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.adjustStock).toHaveBeenCalledWith('v1', { setTo: 4, note: 'Stock count' }),
    )
  })

  it('refused before sending: removing more than there is; no note', async () => {
    const dialog = await openAdjust()
    const amount = within(dialog).getByLabelText('Add (+) or remove (−)')
    fireEvent.change(amount, { target: { value: '-13' } })
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'Damaged' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('you can remove at most 12')
    fireEvent.change(amount, { target: { value: '-2' } })
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Say why the stock changed')
    expect(mocked.adjustStock).not.toHaveBeenCalled()
  })

  it('previewStock rules', () => {
    expect(previewStock(12, 'change', '+20')).toEqual({ after: 32 })
    expect(previewStock(12, 'change', '-12')).toEqual({ after: 0 })
    expect(previewStock(12, 'change', '0')).toMatchObject({
      problem: expect.stringMatching(/changes nothing/),
    })
    expect(previewStock(12, 'change', '1.5')).toMatchObject({ problem: expect.any(String) })
    expect(previewStock(12, 'set', '-1')).toMatchObject({ problem: expect.any(String) })
    expect(previewStock(12, 'set', '0')).toEqual({ after: 0 })
    expect(previewStock(12, 'set', '')).toBeNull()
  })
})

describe('History (dialog)', () => {
  it('every change in words: +/−, stock after, note, the staff member or the order', async () => {
    mocked.fetchStockHistory.mockResolvedValue(
      ok({
        items: [
          {
            id: 'l3',
            change: -2,
            stockAfter: 10,
            reason: 'ORDER_PLACED' as const,
            note: null,
            order: { id: 'o1', number: 'NW-10015' },
            actor: null,
            createdAt: '2026-10-07T16:22:00Z',
          },
          {
            id: 'l2',
            change: 5,
            stockAfter: 12,
            reason: 'MANUAL_ADJUSTMENT' as const,
            note: 'Received from supplier',
            order: null,
            actor: { id: 'u1', name: 'Rafi' },
            createdAt: '2026-10-07T10:00:00Z',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      }),
    )
    render(<InventoryList filters={{}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'History of Oxford Shirt M / Blue' }))
    const dialog = screen.getByRole('dialog', { name: 'Stock history' })
    const [sold, received] = await within(dialog).findAllByRole('listitem')
    expect(sold).toHaveTextContent('Order placed · NW-10015')
    expect(sold).toHaveTextContent('Automatic')
    expect(sold).toHaveTextContent('−2→ 10')
    expect(within(sold!).getByRole('link', { name: 'NW-10015' })).toHaveAttribute(
      'href',
      '/admin/orders/o1',
    )
    expect(received).toHaveTextContent('Changed by hand')
    expect(received).toHaveTextContent('Received from supplier')
    expect(received).toHaveTextContent('Rafi')
    expect(received).toHaveTextContent('+5→ 12')
    expect(mocked.fetchStockHistory).toHaveBeenCalledWith('v1')
  })
})

describe('LowStockList', () => {
  it('lists what needs reordering, with the store-wide limit; empty → says so', async () => {
    mocked.fetchLowStockList.mockResolvedValue(
      ok({ items: [row({ stock: 2, isLow: true })], total: 1, threshold: 5 }),
    )
    const { unmount } = render(<LowStockList />)
    expect(
      await screen.findByText('Store-wide alert limit: 5 (sizes can have their own)'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Change stock of Oxford Shirt M / Blue' }),
    ).toBeInTheDocument()
    unmount()
    mocked.fetchLowStockList.mockResolvedValue(ok({ items: [], total: 0, threshold: 5 }))
    render(<LowStockList />)
    expect(await screen.findByText('Nothing is running low.')).toBeInTheDocument()
  })
})
