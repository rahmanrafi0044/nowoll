import type { AdminBlogDetail } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/blog-api'
import * as content from '@/lib/content-api'
import * as products from '@/lib/products-api'
import { BlogEditor } from './blog-editor'
import { BlogList } from './blog-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/blog-api', () => ({
  fetchBlogPosts: vi.fn(),
  fetchBlogPost: vi.fn(),
  createBlogPost: vi.fn(),
  updateBlogPost: vi.fn(),
  archiveBlogPost: vi.fn(),
}))
vi.mock('@/lib/content-api', () => ({ uploadContentImage: vi.fn() }))
vi.mock('@/lib/products-api', () => ({ fetchProducts: vi.fn() }))
const mocked = vi.mocked(api)
const upload = vi.mocked(content.uploadContentImage)
const fetchProducts = vi.mocked(products.fetchProducts)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const SAVED: AdminBlogDetail = {
  id: 'b1',
  slug: 'eid-looks',
  title: 'Eid looks',
  status: 'DRAFT',
  publishedAt: null,
  scheduled: false,
  updatedAt: '2026-10-14T06:00:00Z',
  excerpt: null,
  content: 'Hello',
  coverImageUrl: null,
  coverImageAlt: null,
  tags: ['eid'],
  seoTitle: null,
  seoDescription: null,
  productIds: [],
}

/** A real-looking product id (the shared rules require UUIDs). */
const pid = (i: number) => `6f1e2c3a-1b2c-4d5e-8f90-12345678900${i}`

const productRow = (id: string, name: string) =>
  ({ id, name, image: null }) as unknown as Awaited<
    ReturnType<typeof products.fetchProducts>
  > extends { data: { items: (infer R)[] } }
    ? R
    : never

beforeEach(() => {
  vi.resetAllMocks()
  fetchProducts.mockResolvedValue(
    ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }) as never,
  )
})

describe('Admin → Content → Blog (step 43)', () => {
  it('list: draft, scheduled and published posts with their state', async () => {
    mocked.fetchBlogPosts.mockResolvedValue(
      ok([
        { ...SAVED, id: 'a', title: 'Draft one' },
        {
          ...SAVED,
          id: 'b',
          title: 'Later',
          status: 'PUBLISHED',
          scheduled: true,
          publishedAt: '2026-12-01T06:00:00Z',
        },
        {
          ...SAVED,
          id: 'c',
          title: 'Live',
          status: 'PUBLISHED',
          publishedAt: '2026-10-01T06:00:00Z',
        },
      ]),
    )
    render(<BlogList archived={false} />)
    expect((await screen.findByText('Later')).closest('tr')).toHaveTextContent('Scheduled')
    expect(screen.getByText('Live').closest('tr')).toHaveTextContent('Published')
    expect(screen.getByText('Draft one').closest('tr')).toHaveTextContent('Draft')
    expect(screen.getByRole('link', { name: 'New post' })).toHaveAttribute(
      'href',
      '/admin/content/blog/new',
    )
  })

  it('new post: the address follows the title; checked before sending; created as a draft', async () => {
    mocked.createBlogPost.mockResolvedValue(ok({ ...SAVED }))
    render(<BlogEditor initial={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/Title: Write a title/)).toBeInTheDocument()
    expect(mocked.createBlogPost).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Eid Looks 2026!' } })
    expect(screen.getByLabelText('Web address')).toHaveValue('eid-looks-2026')
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'Eid, panjabi , ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(mocked.createBlogPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Eid Looks 2026!',
          slug: 'eid-looks-2026',
          tags: ['Eid', 'panjabi'],
          status: 'DRAFT',
          publishedAt: null,
        }),
      ),
    )
    expect(push).toHaveBeenCalledWith('/admin/content/blog/b1')
  })

  it('a future publish date → the button says Schedule', async () => {
    mocked.updateBlogPost.mockResolvedValue(ok({ ...SAVED, status: 'PUBLISHED', scheduled: true }))
    render(<BlogEditor initial={SAVED} />)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    const nextYear = new Date().getFullYear() + 1
    fireEvent.change(screen.getByLabelText('Publish date (optional)'), {
      target: { value: `${nextYear}-01-15T10:00` },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    await waitFor(() =>
      expect(mocked.updateBlogPost).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({
          status: 'PUBLISHED',
          publishedAt: expect.stringMatching(new RegExp(`^${nextYear}-01-1`)),
        }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/Scheduled/)
  })

  it('Insert photo: uploads, then writes the photo with its size — at the end if never clicked in', async () => {
    upload.mockResolvedValue(
      ok({
        url: 'https://x.supabase.co/storage/v1/object/public/product-images/content/a.jpg',
        width: 1200,
        height: 800,
      }),
    )
    render(<BlogEditor initial={SAVED} />)
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'look.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Photo to insert'), { target: { files: [file] } })
    await waitFor(() =>
      expect(screen.getByLabelText('Text')).toHaveValue(
        'Hello\n\n![Describe the photo](https://x.supabase.co/storage/v1/object/public/product-images/content/a.jpg#w=1200&h=800)\n\n',
      ),
    )
  })

  it('Insert photo after clicking in the text: the photo goes where the cursor is', async () => {
    upload.mockResolvedValue(ok({ url: 'https://x.supabase.co/c/b.jpg', width: 10, height: 20 }))
    render(<BlogEditor initial={{ ...SAVED, content: 'AB' }} />)
    const text = screen.getByLabelText('Text') as HTMLTextAreaElement
    text.setSelectionRange(1, 1)
    fireEvent.select(text)
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'b.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Photo to insert'), { target: { files: [file] } })
    await waitFor(() =>
      expect(text).toHaveValue(
        'A\n\n![Describe the photo](https://x.supabase.co/c/b.jpg#w=10&h=20)\n\nB',
      ),
    )
  })

  it('a cover photo needs a description before saving', async () => {
    render(<BlogEditor initial={{ ...SAVED, coverImageUrl: 'https://x.supabase.co/c.jpg' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(
      await screen.findByText(/Cover photo description: Describe the cover photo/),
    ).toBeInTheDocument()
    expect(mocked.updateBlogPost).not.toHaveBeenCalled()
  })

  it('Shop the look: search, add up to 4, reorder, remove — sent as ids in order', async () => {
    fetchProducts.mockResolvedValue(
      ok({
        items: ['Shirt', 'Kurta', 'Chino', 'Polo', 'Tee'].map((n, i) => productRow(pid(i), n)),
        total: 5,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }) as never,
    )
    mocked.updateBlogPost.mockResolvedValue(ok(SAVED))
    render(<BlogEditor initial={SAVED} />)
    const box = screen.getByRole('region', { name: 'Shop the look' })
    fireEvent.change(within(box).getByLabelText('Find a product'), { target: { value: 'shirt' } })
    fireEvent.click(within(box).getByRole('button', { name: 'Search' }))
    const results = await within(box).findByRole('list', { name: 'Search results' })
    for (const name of ['Shirt', 'Kurta', 'Chino', 'Polo'])
      fireEvent.click(
        within(within(results).getByText(name).closest('li')!).getByRole('button', { name: 'Add' }),
      )
    expect(within(box).getByText(/That’s the most/)).toBeInTheDocument()
    fireEvent.click(within(box).getByRole('button', { name: 'Move Kurta up' }))
    fireEvent.click(
      within(
        within(box).getByRole('list', { name: 'Chosen products' }).children[3] as HTMLElement,
      ).getByRole('button', { name: 'Remove' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(mocked.updateBlogPost).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ productIds: [pid(1), pid(0), pid(2)] }),
      ),
    )
  })

  it('archive asks first; archived posts can be restored as drafts', async () => {
    mocked.archiveBlogPost.mockResolvedValue(ok({ ...SAVED, status: 'ARCHIVED' }))
    render(<BlogEditor initial={SAVED} />)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, archive' }))
    await waitFor(() => expect(mocked.archiveBlogPost).toHaveBeenCalledWith('b1'))
    expect(await screen.findByRole('button', { name: 'Restore as draft' })).toBeInTheDocument()
  })
})
