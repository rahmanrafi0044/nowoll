import type { AdminProductRow, ProductImportSummary } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { parseFilters } from '@/lib/product-filters'
import * as api from '@/lib/products-api'
import { ImportCsv } from './import-csv'
import { ProductList } from './product-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/products',
}))
vi.mock('@/lib/products-api', () => ({
  fetchProducts: vi.fn(),
  bulkProducts: vi.fn(),
  fetchCategories: vi.fn(),
  exportProductsCsv: vi.fn(),
  importProductsCsv: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const row = (over: Partial<AdminProductRow>): AdminProductRow => ({
  id: 'p1',
  name: 'Oxford Shirt',
  slug: 'oxford-shirt',
  status: 'ACTIVE',
  isFeatured: false,
  category: { id: 'c1', name: 'Men' },
  basePrice: '1490',
  compareAtPrice: null,
  image: null,
  imageCount: 1,
  variantCount: 2,
  totalStock: 12,
  lowStockVariants: 0,
  publishable: true,
  updatedAt: '2026-10-05T18:30:00Z',
  ...over,
})
const ROWS = [
  row({ id: 'p1', name: 'Oxford Shirt', isFeatured: true, lowStockVariants: 1 }),
  row({
    id: 'p2',
    name: 'Draft Panjabi',
    slug: 'draft-panjabi',
    status: 'DRAFT',
    imageCount: 0,
    publishable: false,
  }),
]
const page = (items: AdminProductRow[], over = {}) =>
  ok({ items, total: items.length, page: 1, pageSize: 25, totalPages: 1, ...over })

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchProducts.mockResolvedValue(page(ROWS))
  mocked.fetchCategories.mockResolvedValue(
    ok([{ id: 'c1', name: 'Men', children: [{ id: 'c2', name: 'Shirts', children: [] }] }]),
  )
})

describe('ProductList', () => {
  it('rows: status, featured, price, stock with low count, date in Dhaka, and what a draft still needs', async () => {
    render(<ProductList filters={{}} />)
    const table = await screen.findByRole('table')
    const [, oxford, draft] = within(table).getAllByRole('row')
    expect(oxford).toHaveTextContent('Oxford Shirt')
    expect(oxford).toHaveTextContent('Featured')
    expect(oxford).toHaveTextContent('Live')
    expect(oxford).toHaveTextContent('৳1,490')
    expect(oxford).toHaveTextContent('121 low') // 12 in stock, "1 low"
    expect(oxford).toHaveTextContent('6 Oct 2026') // 00:30 on the 6th in Dhaka
    expect(draft).toHaveTextContent('Needs a photo before it can go live')
    expect(screen.getByText('2 products · page 1 of 1')).toBeInTheDocument()
  })

  it('filters change the page address (back to page 1); search uses the box', async () => {
    render(<ProductList filters={{ page: 3 }} />)
    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'DRAFT' } })
    expect(push).toHaveBeenLastCalledWith('/admin/products?status=DRAFT')
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'c2' } })
    expect(push).toHaveBeenLastCalledWith('/admin/products?categoryId=c2')
    expect(screen.getByRole('option', { name: 'Men › Shirts' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Low stock only'))
    expect(push).toHaveBeenLastCalledWith('/admin/products?lowStock=true')
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: ' oxford ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(push).toHaveBeenLastCalledWith('/admin/products?q=oxford')
  })

  it('loads with the filters it was given', async () => {
    render(<ProductList filters={{ status: 'DRAFT', page: 2 }} />)
    await screen.findByRole('table')
    expect(mocked.fetchProducts).toHaveBeenCalledWith({ status: 'DRAFT', page: 2 })
  })

  it('bulk: publish the ticked products; failures listed with reasons and stay ticked', async () => {
    mocked.bulkProducts.mockResolvedValue(
      ok({
        action: 'publish' as const,
        succeeded: ['p1'],
        failed: [
          { id: 'p2', name: 'Draft Panjabi', reason: 'A published product needs an image.' },
        ],
      }),
    )
    render(<ProductList filters={{}} />)
    fireEvent.click(await screen.findByLabelText('Select all products on this page'))
    const bar = screen.getByRole('toolbar', { name: 'Actions for the selected products' })
    expect(bar).toHaveTextContent('2 products selected')
    fireEvent.click(within(bar).getByRole('button', { name: 'Publish' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('1 product published.')
    expect(status).toHaveTextContent('Draft Panjabi — A published product needs an image.')
    expect(mocked.bulkProducts).toHaveBeenCalledWith('publish', ['p1', 'p2'])
    await waitFor(() => expect(mocked.fetchProducts).toHaveBeenCalledTimes(2)) // reloaded
    expect(screen.getByLabelText('Select Draft Panjabi')).toBeChecked()
    expect(screen.getByLabelText('Select Oxford Shirt')).not.toBeChecked()
  })

  it('archive asks first — cancel does nothing', async () => {
    mocked.bulkProducts.mockResolvedValue(
      ok({ action: 'archive' as const, succeeded: ['p1'], failed: [] }),
    )
    render(<ProductList filters={{}} />)
    fireEvent.click(await screen.findByLabelText('Select Oxford Shirt'))
    fireEvent.click(screen.getByRole('button', { name: 'Archive…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocked.bulkProducts).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Archive…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive 1 product' }))
    await waitFor(() => expect(mocked.bulkProducts).toHaveBeenCalledWith('archive', ['p1']))
  })

  it('new filters → nothing stays ticked', async () => {
    const { rerender } = render(<ProductList filters={{}} />)
    fireEvent.click(await screen.findByLabelText('Select Oxford Shirt'))
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
    rerender(<ProductList filters={{ status: 'DRAFT' }} />)
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('paging buttons', async () => {
    mocked.fetchProducts.mockResolvedValue(page(ROWS, { page: 2, totalPages: 3, total: 60 }))
    render(<ProductList filters={{ page: 2 }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    expect(push).toHaveBeenLastCalledWith('/admin/products?page=3')
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(push).toHaveBeenLastCalledWith('/admin/products') // page 1 = no page in the address
  })

  it('empty result', async () => {
    mocked.fetchProducts.mockResolvedValue(page([]))
    render(<ProductList filters={{ q: 'zzz' }} />)
    expect(await screen.findByText('No products match these filters.')).toBeInTheDocument()
  })
})

describe('parseFilters (from the page address)', () => {
  it('keeps known values only', () => {
    expect(
      parseFilters({
        q: ' shirt ',
        status: 'DRAFT',
        sort: 'name',
        lowStock: 'true',
        page: '2',
        categoryId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      }),
    ).toEqual({
      q: 'shirt',
      status: 'DRAFT',
      sort: 'name',
      lowStock: true,
      page: 2,
      categoryId: '0f8fad5b-d9cb-469f-a165-70867728950e',
    })
    expect(
      parseFilters({
        status: 'deleted',
        sort: 'x',
        page: '-1',
        categoryId: 'abc',
        lowStock: 'yes',
      }),
    ).toEqual({
      q: undefined,
      status: undefined,
      sort: undefined,
      lowStock: undefined,
      page: undefined,
      categoryId: undefined,
    })
  })
})

describe('ImportCsv', () => {
  const summary = (dryRun: boolean): ProductImportSummary => ({
    dryRun,
    products: { created: 2, updated: 1, unchanged: 5 },
    variants: { created: 6, updated: 0, unchanged: 10 },
    stockChanges: 6,
  })
  const file = new File(['product_slug,name\n'], 'products.csv', { type: 'text/csv' })
  const choose = () =>
    fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } })

  it('check first (nothing saved), then import — only on the second click', async () => {
    mocked.importProductsCsv
      .mockResolvedValueOnce(ok(summary(true)))
      .mockResolvedValueOnce(ok(summary(false)))
    render(<ImportCsv />)
    choose()
    fireEvent.click(screen.getByRole('button', { name: 'Check file' }))
    expect(await screen.findByText('Nothing has been saved yet. This would:')).toBeInTheDocument()
    expect(mocked.importProductsCsv).toHaveBeenLastCalledWith(file, true)
    expect(screen.getByRole('row', { name: /^Products/ })).toHaveTextContent('Products215')

    fireEvent.click(screen.getByRole('button', { name: 'Import 3 products' }))
    expect(await screen.findByText('Import complete')).toBeInTheDocument()
    expect(mocked.importProductsCsv).toHaveBeenLastCalledWith(file, false)
  })

  it('problems are listed line by line (row numbers come from the API); nothing saved', async () => {
    mocked.importProductsCsv.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'The file has 2 problems.',
      details: ['Row 3: price must be a number', 'Row 7: unknown category "Mne"'],
    })
    render(<ImportCsv />)
    choose()
    fireEvent.click(screen.getByRole('button', { name: 'Check file' }))
    const alert = await screen.findByRole('alert')
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Row 3: price must be a number', 'Row 7: unknown category "Mne"'])
    expect(alert).toHaveTextContent('nothing was saved')
    expect(mocked.importProductsCsv).toHaveBeenCalledTimes(1)
  })

  it('a file that changes nothing → no import button to press', async () => {
    mocked.importProductsCsv.mockResolvedValue(
      ok({
        dryRun: true,
        products: { created: 0, updated: 0, unchanged: 3 },
        variants: { created: 0, updated: 0, unchanged: 9 },
        stockChanges: 0,
      }),
    )
    render(<ImportCsv />)
    choose()
    fireEvent.click(screen.getByRole('button', { name: 'Check file' }))
    expect(await screen.findByText(/nothing to import/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import changes' })).toBeDisabled()
  })

  it('no file chosen → asks for one', async () => {
    render(<ImportCsv />)
    fireEvent.click(screen.getByRole('button', { name: 'Check file' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a CSV file first.')
    expect(mocked.importProductsCsv).not.toHaveBeenCalled()
  })
})
