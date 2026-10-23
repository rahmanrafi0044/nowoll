import type { AdminCategoryNode } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/categories-api'
import { ArchivedCategories } from './archived-categories'
import { EditCategory, NewCategory } from './category-form'
import { CategoryTree } from './category-tree'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/categories',
}))
vi.mock('@/lib/categories-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/categories-api')>()),
  fetchCategoryTree: vi.fn(),
  fetchArchivedCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  archiveCategory: vi.fn(),
  restoreCategory: vi.fn(),
  reorderCategories: vi.fn(),
}))
vi.mock('@/lib/content-api', () => ({ uploadContentImage: vi.fn() }))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const node = (more: Partial<AdminCategoryNode>): AdminCategoryNode => ({
  sizeChartId: null,
  id: 'x',
  name: 'X',
  slug: 'x',
  parentId: null,
  description: null,
  imageUrl: null,
  imageAlt: null,
  sizeGuide: null,
  editorial: [],
  seoTitle: null,
  seoDescription: null,
  isActive: true,
  sortOrder: 0,
  productCount: 0,
  children: [],
  ...more,
})
const SHIRTS = node({ id: 'c2', name: 'Shirts', slug: 'shirts', parentId: 'c1', productCount: 3 })
const FORMAL = node({ id: 'c3', name: 'Formal', slug: 'formal', parentId: 'c2' })
SHIRTS.children = [FORMAL]
const MEN = node({ id: 'c1', name: 'Men', slug: 'men', children: [SHIRTS] })
const WOMEN = node({ id: 'c4', name: 'Women', slug: 'women', isActive: false })
const TREE = [MEN, WOMEN]

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchCategoryTree.mockResolvedValue(ok(TREE))
  mocked.reorderCategories.mockResolvedValue(ok({ ids: [] }))
})

describe('category tree', () => {
  it('nested, with product counts linking to the products, and what customers see', async () => {
    const hiddenKid = node({ id: 'c5', name: 'Sarees', slug: 'sarees', parentId: 'c4' })
    mocked.fetchCategoryTree.mockResolvedValue(ok([MEN, { ...WOMEN, children: [hiddenKid] }]))
    render(<CategoryTree />)
    const shirts = (await screen.findByRole('link', { name: 'Shirts' })).closest('div')!
    expect(within(shirts).getByRole('link', { name: '3 products' })).toHaveAttribute(
      'href',
      '/admin/products?categoryId=c2',
    )
    expect(within(shirts).getByText('On')).toBeInTheDocument()
    const women = screen.getByRole('link', { name: 'Women' }).closest('div')!
    expect(within(women).getByText('Hidden')).toBeInTheDocument()
    const sarees = screen.getByRole('link', { name: 'Sarees' }).closest('div')!
    expect(within(sarees).getByText('Hidden by parent')).toBeInTheDocument()
  })

  it('↓ moves a category among its sisters only, saves, reloads', async () => {
    render(<CategoryTree />)
    expect(await screen.findByRole('button', { name: 'Move Men up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Shirts up' })).toBeDisabled() // alone in Men
    fireEvent.click(screen.getByRole('button', { name: 'Move Men down' }))
    await waitFor(() => expect(mocked.reorderCategories).toHaveBeenCalledWith(null, ['c4', 'c1']))
    await waitFor(() => expect(mocked.fetchCategoryTree).toHaveBeenCalledTimes(2))
  })

  it('a refused order (the list changed) is shown', async () => {
    mocked.reorderCategories.mockResolvedValue({
      ok: false,
      status: 409,
      message: 'The categories changed since this page was loaded. Reload and try again.',
    })
    render(<CategoryTree />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move Women up' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload and try again')
  })
})

describe('new category', () => {
  it('address follows the name; picture needs a description; created → its page', async () => {
    mocked.createCategory.mockResolvedValue(ok({ id: 'new1', slug: 'eid-collection' }))
    vi.mocked((await import('@/lib/content-api')).uploadContentImage).mockResolvedValue(
      ok({ url: 'https://cdn.example/content/eid.webp', width: 1200, height: 800 }),
    )
    render(<NewCategory />)
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Eid Collection' } })
    expect(screen.getByLabelText('Web address')).toHaveValue('eid-collection')
    fireEvent.change(screen.getByLabelText('Inside'), { target: { value: 'c1' } })
    const file = new File([new Uint8Array(10)], 'eid.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/Picture/), { target: { files: [file] } })
    await screen.findByLabelText('Describe the picture')
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Describe the picture')
    expect(mocked.createCategory).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Describe the picture'), {
      target: { value: 'Panjabis for Eid' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    await waitFor(() =>
      expect(mocked.createCategory).toHaveBeenCalledWith({
        name: 'Eid Collection',
        slug: 'eid-collection',
        parentId: 'c1',
        description: null,
        imageUrl: 'https://cdn.example/content/eid.webp',
        imageAlt: 'Panjabis for Eid',
        sizeGuide: null,
        sizeChartId: null,
        isActive: true,
        seoTitle: null,
        seoDescription: null,
        editorial: [], // 38f: no photo tiles
      }),
    )
    expect(push).toHaveBeenCalledWith('/admin/categories/new1')
  })

  it('a bad address is caught before sending; inside a hidden category → warned', async () => {
    render(<NewCategory />)
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Sarees' } })
    fireEvent.change(screen.getByLabelText('Inside'), { target: { value: 'c4' } })
    expect(
      screen.getByText(/“Women” is hidden, so customers won’t see this one either/),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Women (hidden)' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'Sarees!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Web address')
    expect(mocked.createCategory).not.toHaveBeenCalled()
  })

  it('size guide: "Start with a table" and a live preview as a table', async () => {
    render(<NewCategory />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start with a table' }))
    const guide = within(screen.getByRole('region', { name: 'Size guide' }))
    expect(guide.getByRole('table')).toHaveTextContent('SizeChest (in)Length (in)')
    expect(guide.getAllByRole('row')).toHaveLength(5)
  })
})

describe('edit category', () => {
  it('38f: a photo tile needs its photo, words and description; then it is saved', async () => {
    mocked.updateCategory.mockResolvedValue(ok({ id: 'c2', slug: 'shirts' }))
    vi.mocked((await import('@/lib/content-api')).uploadContentImage).mockResolvedValue(
      ok({ url: 'https://cdn.example/content/edit.webp', width: 1200, height: 1500 }),
    )
    render(<EditCategory id="c2" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a photo tile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Tile 1: Upload a photo')
    expect(alert).toHaveTextContent('Tile 1: Write a heading')
    expect(mocked.updateCategory).not.toHaveBeenCalled()

    const file = new File([new Uint8Array(10)], 'edit.png', { type: 'image/png' })
    const tile = screen.getByRole('group', { name: 'Tile 1' })
    fireEvent.change(within(tile).getByLabelText(/^Photo/), { target: { files: [file] } })
    fireEvent.change(within(tile).getByLabelText('Describe the photo'), {
      target: { value: 'Shirts on a rail' },
    })
    fireEvent.change(within(tile).getByLabelText('Heading'), {
      target: { value: 'The office edit' },
    })
    fireEvent.click(within(tile).getByLabelText(/^Wide/))
    // Wait until the upload has filled in the photo's address.
    await within(tile).findByRole('button', { name: 'Remove picture' })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocked.updateCategory).toHaveBeenCalledWith(
        'c2',
        expect.objectContaining({
          editorial: [
            {
              imageUrl: 'https://cdn.example/content/edit.webp',
              imageAlt: 'Shirts on a rail',
              heading: 'The office edit',
              text: null,
              href: null,
              position: 4,
              wide: true,
            },
          ],
        }),
      ),
    )
  })

  it('it can’t go inside itself or its subcategories; the address is sent only when changed', async () => {
    mocked.updateCategory.mockResolvedValue(ok({ id: 'c2', slug: 'shirts' }))
    render(<EditCategory id="c2" />)
    const inside = await screen.findByLabelText('Inside')
    const options = within(inside)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['— Top level (in the main menu) —', 'Men', 'Women (hidden)'])
    expect(inside).toHaveValue('c1')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'Office and casual shirts.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocked.updateCategory).toHaveBeenCalledWith(
        'c2',
        expect.objectContaining({ description: 'Office and casual shirts.' }),
      ),
    )
    expect(mocked.updateCategory.mock.calls[0]![1]).not.toHaveProperty('slug')
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('a new address on a live category warns; hiding one with subcategories says what else hides', async () => {
    render(<EditCategory id="c2" />)
    fireEvent.change(await screen.findByLabelText('Web address'), { target: { value: 'tops' } })
    expect(
      screen.getByText(/Old links to \/shop\/shirts will lead here automatically/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Show on the shop'))
    expect(screen.getByText(/also hides its 1 subcategory/)).toBeInTheDocument()
  })

  it('archive asks first; refused while products are inside → a link to move them', async () => {
    mocked.archiveCategory.mockResolvedValue({
      ok: false,
      status: 409,
      message: 'This category has 3 products. Move them to another category first.',
    })
    render(<EditCategory id="c2" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Confirm archiving the category' })).getByRole(
        'button',
        { name: 'Keep it' },
      ),
    )
    expect(mocked.archiveCategory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, archive' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Move them to another category first')
    expect(within(alert).getByRole('link', { name: 'See its products' })).toHaveAttribute(
      'href',
      '/admin/products?categoryId=c2',
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('archived or unknown → says so', async () => {
    render(<EditCategory id="gone" />)
    expect(await screen.findByText(/doesn’t exist/)).toBeInTheDocument()
  })
})

describe('archived categories', () => {
  it('restore → back hidden, the list reloads', async () => {
    mocked.fetchArchivedCategories.mockResolvedValue(
      ok([{ id: 'a1', name: 'Kids', slug: 'kids', archivedAt: '2026-10-01T10:00:00Z' }]),
    )
    mocked.restoreCategory.mockResolvedValue(ok({ id: 'a1', slug: 'kids' }))
    render(<ArchivedCategories />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Kids' }))
    await waitFor(() => expect(mocked.restoreCategory).toHaveBeenCalledWith('a1'))
    expect(await screen.findByRole('status')).toHaveTextContent('Kids is back, hidden')
    await waitFor(() => expect(mocked.fetchArchivedCategories).toHaveBeenCalledTimes(2))
  })
})
