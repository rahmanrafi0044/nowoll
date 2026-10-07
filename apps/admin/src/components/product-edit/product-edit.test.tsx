import type { AdminImage, AdminProductDetail } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/products-api'
import { imageFileProblem, reorder } from './images-section'
import { NewProductForm } from './new-product-form'
import { ProductEditor } from './product-editor'
import { suggestSku } from './variants-section'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/products/p1',
}))
vi.mock('@/lib/products-api', () => ({
  fetchProduct: vi.fn(),
  fetchCategories: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  archiveProduct: vi.fn(),
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  deleteVariant: vi.fn(),
  uploadImage: vi.fn(),
  updateImage: vi.fn(),
  deleteImage: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })
const refused = (message: string, status = 409) => ({ ok: false as const, status, message })

const img = (id: string, sortOrder: number, over: Partial<AdminImage> = {}): AdminImage => ({
  id,
  url: `https://x.supabase.co/storage/v1/object/public/p/${id}.jpg`,
  altText: `Photo ${id}`,
  variantId: null,
  sortOrder,
  ...over,
})
const PRODUCT: AdminProductDetail = {
  id: 'p1',
  name: 'Oxford Shirt',
  slug: 'oxford-cotton-shirt',
  status: 'DRAFT',
  isFeatured: false,
  category: { id: 'c1', name: 'Men' },
  basePrice: '1490',
  compareAtPrice: null,
  shortDescription: null,
  description: 'Soft cotton.',
  tags: ['cotton'],
  seoTitle: null,
  seoDescription: null,
  variants: [
    {
      id: 'v1',
      sku: 'OXFORD-COTTON-M-NAVY',
      size: 'M',
      color: 'Navy',
      colorHex: null,
      price: null,
      compareAtPrice: null,
      stock: 7,
      lowStockThreshold: null,
      weightGrams: null,
      isActive: true,
      sortOrder: 0,
    },
  ],
  images: [],
  missingToPublish: ['image'],
  createdAt: '2026-10-06T00:00:00Z',
  updatedAt: '2026-10-06T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchProduct.mockResolvedValue(ok(PRODUCT))
  mocked.fetchCategories.mockResolvedValue(
    ok([{ id: 'c1', name: 'Men', children: [{ id: 'c2', name: 'Shirts', children: [] }] }]),
  )
})
const section = (name: string) => screen.getByRole('region', { name })
const editor = async () => {
  render(<ProductEditor id="p1" />)
  await screen.findByRole('heading', { name: 'Oxford Shirt' })
}

describe('NewProductForm', () => {
  it('creates a DRAFT with the basics and opens its edit page', async () => {
    mocked.createProduct.mockResolvedValue(ok({ id: 'new-id' }))
    render(<NewProductForm />)
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: ' Linen Shirt ' } })
    // Wait for the OPTIONS, not just the dropdown: it exists (disabled) while the
    // categories load, and choosing too early silently does nothing (seen on CI).
    await screen.findByRole('option', { name: 'Men › Shirts' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'c2' },
    })
    fireEvent.change(screen.getByLabelText('Price (৳)'), { target: { value: '1,490.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/products/new-id'))
    expect(mocked.createProduct).toHaveBeenCalledWith({
      name: 'Linen Shirt',
      categoryId: 'c2',
      basePrice: 1490.5,
    })
  })

  it('checks before sending: name, category, a real price', async () => {
    render(<NewProductForm />)
    await screen.findByRole('option', { name: 'Men › Shirts' })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Give the product a name.')
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'c1' },
    })
    fireEvent.change(screen.getByLabelText('Price (৳)'), { target: { value: '12.345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the price in taka')
    expect(mocked.createProduct).not.toHaveBeenCalled()
  })
})

describe('ProductEditor — details', () => {
  it('saves only the changed fields (prices as numbers, tags as a list)', async () => {
    mocked.updateProduct.mockResolvedValue(ok({ id: 'p1' }))
    await editor()
    const details = section('Details')
    const save = within(details).getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled() // nothing changed yet
    fireEvent.change(within(details).getByLabelText('“Was” price (৳)'), {
      target: { value: '1990' },
    })
    fireEvent.change(within(details).getByLabelText('Tags'), {
      target: { value: 'cotton, office , cotton' },
    })
    fireEvent.change(within(details).getByLabelText('Short description'), {
      target: { value: '  ' },
    })
    expect(within(details).getByText('Unsaved changes')).toBeInTheDocument()
    // What the API returns after the save (the reload after "Save").
    mocked.fetchProduct.mockResolvedValue(
      ok({
        ...PRODUCT,
        compareAtPrice: '1990',
        tags: ['cotton', 'office'],
        updatedAt: '2026-10-06T02:00:00Z',
      }),
    )
    fireEvent.click(save)
    await waitFor(() =>
      expect(mocked.updateProduct).toHaveBeenCalledWith('p1', {
        compareAtPrice: 1990,
        tags: ['cotton', 'office'],
      }),
    ) // short description: blank before and after → not sent
    expect(await within(details).findByText('Saved.')).toBeInTheDocument()
    expect(within(details).getByLabelText('Tags')).toHaveValue('cotton, office') // tidied by the save
    expect(within(details).queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('warns before leaving with unsaved changes', async () => {
    await editor()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false) // nothing typed yet
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Oxford Shirt II' } })
    const again = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(again)
    expect(again.defaultPrevented).toBe(true)
  })

  it('typed but unsaved text SURVIVES other changes (e.g. a photo upload reloads the product)', async () => {
    mocked.uploadImage.mockResolvedValue(ok({ id: 'i1' }))
    await editor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Typed, not saved' } })
    mocked.fetchProduct.mockResolvedValue(
      ok({
        ...PRODUCT,
        images: [img('i1', 0)],
        missingToPublish: [],
        updatedAt: '2026-10-06T01:00:00Z',
      }),
    )
    const photos = section('Photos')
    fireEvent.change(within(photos).getByLabelText('Photo'), {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.change(within(photos).getAllByLabelText('Alt text').at(-1)!, {
      target: { value: 'Front' },
    })
    fireEvent.click(within(photos).getByRole('button', { name: 'Upload photo' }))
    expect(await within(photos).findByRole('group', { name: 'Main photo' })).toBeInTheDocument() // reloaded
    expect(screen.getByLabelText('Name')).toHaveValue('Typed, not saved')
  })

  it('a validation problem from the API is shown; bad prices are caught first', async () => {
    mocked.updateProduct.mockResolvedValue(refused('slug may only use lowercase letters', 400))
    await editor()
    fireEvent.change(screen.getByLabelText('Price (৳)'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the price in taka')
    fireEvent.change(screen.getByLabelText('Price (৳)'), { target: { value: '1490' } })
    fireEvent.change(screen.getByLabelText('Web address (slug)'), { target: { value: 'Bad Slug' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'slug may only use lowercase letters',
    )
  })
})

describe('ProductEditor — status', () => {
  it('Publish is greyed out with what is missing', async () => {
    await editor()
    const status = section('Status')
    expect(within(status).getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(status).toHaveTextContent('Needs a photo before it can go live.')
  })

  it('once ready, Publish makes it live', async () => {
    mocked.fetchProduct.mockResolvedValue(
      ok({ ...PRODUCT, images: [img('i1', 0)], missingToPublish: [] }),
    )
    mocked.updateProduct.mockResolvedValue(ok({ id: 'p1' }))
    await editor()
    fireEvent.click(within(section('Status')).getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(mocked.updateProduct).toHaveBeenCalledWith('p1', { status: 'ACTIVE' }),
    )
  })

  it('live: a link to the shop page and "Move to draft"', async () => {
    mocked.fetchProduct.mockResolvedValue(
      ok({ ...PRODUCT, status: 'ACTIVE', missingToPublish: [] }),
    )
    await editor()
    const status = section('Status')
    expect(within(status).getByRole('link', { name: /View in the shop/ })).toHaveAttribute(
      'href',
      'http://localhost:3000/products/oxford-cotton-shirt',
    )
    expect(within(status).getByRole('button', { name: 'Move to draft' })).toBeEnabled()
  })

  it('archive asks first, then goes back to the list', async () => {
    mocked.archiveProduct.mockResolvedValue(ok({ id: 'p1' }))
    await editor()
    fireEvent.click(screen.getByRole('button', { name: 'Archive…' }))
    expect(mocked.archiveProduct).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Archive product' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/products'))
  })

  it('archived: everything read-only', async () => {
    mocked.fetchProduct.mockResolvedValue(ok({ ...PRODUCT, status: 'ARCHIVED' }))
    await editor()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add size/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upload photo' })).not.toBeInTheDocument()
  })
})

describe('ProductEditor — sizes and colours', () => {
  it('a row saves its own changes; stock is shown, never sent', async () => {
    mocked.updateVariant.mockResolvedValue(ok({ id: 'v1' }))
    await editor()
    const variants = section('Sizes and colours')
    expect(within(variants).getByRole('row', { name: /M/ })).toHaveTextContent('7')
    fireEvent.change(within(variants).getByLabelText('Own price of M / Navy'), {
      target: { value: '1590' },
    })
    fireEvent.change(within(variants).getByLabelText('Low-stock alert for M / Navy'), {
      target: { value: '2' },
    })
    fireEvent.click(within(variants).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.updateVariant).toHaveBeenCalledWith('v1', {
        size: 'M',
        color: 'Navy',
        colorHex: null,
        sku: 'OXFORD-COTTON-M-NAVY',
        price: 1590,
        lowStockThreshold: 2,
        isActive: true,
      }),
    )
  })

  it('remove asks first; a refusal (last size of a live product) is shown', async () => {
    mocked.deleteVariant.mockResolvedValue(refused('A published product needs an active variant.'))
    await editor()
    fireEvent.click(screen.getByRole('button', { name: 'Remove…' }))
    expect(mocked.deleteVariant).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove M / Navy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('needs an active variant')
  })

  it('"Add sizes": one colour × several sizes → one variant each, SKUs suggested; failures listed', async () => {
    mocked.createVariant
      .mockResolvedValueOnce(ok({ id: 'a' }))
      .mockResolvedValueOnce(refused('That SKU is already in use.'))
      .mockResolvedValueOnce(ok({ id: 'c' }))
    await editor()
    const variants = section('Sizes and colours')
    fireEvent.change(within(variants).getByLabelText('Colour'), { target: { value: 'Light Blue' } })
    fireEvent.change(within(variants).getByLabelText('Sizes'), { target: { value: 'S, M, L, M' } })
    fireEvent.change(within(variants).getByLabelText('Starting stock (each)'), {
      target: { value: '5' },
    })
    expect(variants).toHaveTextContent(
      'Will add: S (OXFORD-COTTON-S-LIGHT-BLUE), M (OXFORD-COTTON-M-LIGHT-BLUE), L (OXFORD-COTTON-L-LIGHT-BLUE)',
    )
    fireEvent.click(within(variants).getByRole('button', { name: 'Add 3 sizes' }))
    expect(await within(variants).findByText('2 added.')).toBeInTheDocument()
    expect(within(variants).getByRole('alert')).toHaveTextContent(
      'Not added — M: That SKU is already in use.',
    )
    expect(mocked.createVariant).toHaveBeenNthCalledWith(1, 'p1', {
      size: 'S',
      color: 'Light Blue',
      colorHex: null,
      sku: 'OXFORD-COTTON-S-LIGHT-BLUE',
      stock: 5,
    })
  })
})

describe('ProductEditor — photos', () => {
  const withPhotos = {
    ...PRODUCT,
    images: [img('a', 0), img('b', 1), img('c', 2)],
    missingToPublish: [],
  }

  it('the first is the main photo; it can’t move earlier, the last can’t move later', async () => {
    mocked.fetchProduct.mockResolvedValue(ok(withPhotos))
    await editor()
    const photos = section('Photos')
    expect(within(photos).getByRole('group', { name: 'Main photo' })).toBeInTheDocument()
    expect(within(photos).getByRole('button', { name: 'Move main photo earlier' })).toBeDisabled()
    expect(within(photos).getByRole('button', { name: 'Move photo 3 later' })).toBeDisabled()
  })

  it('moving saves the new order (only the photos whose position changed)', async () => {
    mocked.fetchProduct.mockResolvedValue(ok(withPhotos))
    mocked.updateImage.mockResolvedValue(ok({ id: 'x' }))
    await editor()
    fireEvent.click(screen.getByRole('button', { name: 'Move photo 3 earlier' }))
    await waitFor(() => expect(mocked.updateImage).toHaveBeenCalledTimes(2))
    expect(mocked.updateImage).toHaveBeenCalledWith('p1', 'c', { sortOrder: 1 })
    expect(mocked.updateImage).toHaveBeenCalledWith('p1', 'b', { sortOrder: 2 })
  })

  it('upload: the file is checked first; alt text required', async () => {
    await editor()
    const photos = section('Photos')
    const picker = within(photos).getByLabelText('Photo')
    fireEvent.change(picker, {
      target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
    })
    expect(within(photos).getByRole('alert')).toHaveTextContent('Use a JPEG, PNG or WebP photo.')
    fireEvent.change(picker, {
      target: { files: [new File(['x'], 'a.webp', { type: 'image/webp' })] },
    })
    fireEvent.click(within(photos).getByRole('button', { name: 'Upload photo' }))
    expect(within(photos).getByRole('alert')).toHaveTextContent('Describe the photo')
    expect(mocked.uploadImage).not.toHaveBeenCalled()
  })

  it('delete asks first', async () => {
    mocked.fetchProduct.mockResolvedValue(ok(withPhotos))
    mocked.deleteImage.mockResolvedValue(ok({ id: 'b' }))
    await editor()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete…' })[1]!)
    expect(mocked.deleteImage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete photo 2' }))
    await waitFor(() => expect(mocked.deleteImage).toHaveBeenCalledWith('p1', 'b'))
  })
})

describe('helpers', () => {
  it('suggestSku: upper case, only letters/digits/dashes', () => {
    expect(suggestSku('OXFORD', 'xl', 'Light Blue')).toBe('OXFORD-XL-LIGHT-BLUE')
    expect(suggestSku('NW', '40/42', 'Off-white!')).toBe('NW-40-42-OFF-WHITE')
  })

  it('imageFileProblem: type and the 5 MB limit', () => {
    expect(imageFileProblem(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull()
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    expect(imageFileProblem(big)).toMatch(/limit is 5 MB/)
  })

  it('reorder: positions 0,1,2… — only changed ones returned (even from messy numbers)', () => {
    const messy = [img('a', 0), img('b', 0), img('c', 7)]
    expect(reorder(messy, 2, -1)).toEqual([
      { id: 'c', sortOrder: 1, before: 7 },
      { id: 'b', sortOrder: 2, before: 0 },
    ])
  })
})
