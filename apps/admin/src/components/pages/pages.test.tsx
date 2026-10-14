import type { AdminPageDetail } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/pages-api'
import { EditPage, NewPage } from './page-editor'
import { PageList } from './page-list'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/content/pages',
}))
vi.mock('@/lib/pages-api', () => ({
  fetchPages: vi.fn(),
  fetchPage: vi.fn(),
  createPage: vi.fn(),
  updatePage: vi.fn(),
  archivePage: vi.fn(),
  addStarterPages: vi.fn(),
}))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const PAGE: AdminPageDetail = {
  id: 'p1',
  slug: 'return-policy',
  title: 'Return policy',
  status: 'DRAFT',
  content: '## How long\n\nWithin **7 days**.',
  seoTitle: null,
  seoDescription: null,
  createdAt: '2026-10-09T08:00:00Z',
  updatedAt: '2026-10-09T08:00:00Z',
}
const at = (more: Partial<AdminPageDetail>) => ({ ...PAGE, ...more })

beforeEach(() => {
  vi.resetAllMocks()
  mocked.fetchPage.mockResolvedValue(ok(PAGE))
  mocked.updatePage.mockImplementation(async (_id, body) => ok(at({ ...body })))
})

describe('page list', () => {
  it('rows with status; a published page links to the shop; starter pages added and the list reloaded', async () => {
    mocked.fetchPages.mockResolvedValue(
      ok([
        at({ id: 'p1', title: 'Privacy policy', slug: 'privacy', status: 'PUBLISHED' }),
        at({ id: 'p2', title: 'FAQ', slug: 'faq', status: 'DRAFT' }),
      ]),
    )
    mocked.addStarterPages.mockResolvedValue(ok({ created: ['terms', 'about'] }))
    render(<PageList archived={false} />)
    const privacy = (await screen.findByRole('link', { name: 'Privacy policy' })).closest('tr')!
    expect(privacy).toHaveTextContent('Published')
    expect(within(privacy).getByRole('link', { name: '/privacy' })).toHaveAttribute(
      'href',
      'http://localhost:3000/privacy',
    )
    const faq = screen.getByRole('link', { name: 'FAQ' }).closest('tr')!
    expect(within(faq).queryByRole('link', { name: '/faq' })).toBeNull() // a draft isn't on the shop
    expect(mocked.fetchPages).toHaveBeenCalledWith(undefined)

    fireEvent.click(screen.getByRole('button', { name: 'Add starter pages' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Added 2 starter pages as drafts')
    await waitFor(() => expect(mocked.fetchPages).toHaveBeenCalledTimes(2))
  })

  it('the archive: asks the API for archived pages; no starter button there', async () => {
    mocked.fetchPages.mockResolvedValue(ok([]))
    render(<PageList archived />)
    expect(await screen.findByText('Nothing archived.')).toBeInTheDocument()
    expect(mocked.fetchPages).toHaveBeenCalledWith('ARCHIVED')
    expect(screen.queryByRole('button', { name: 'Add starter pages' })).toBeNull()
  })
})

describe('new page', () => {
  it('the address follows the title until edited; the preview shows the shop’s look', async () => {
    render(<NewPage />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Size & fit guide' } })
    expect(screen.getByLabelText('Web address')).toHaveValue('size-and-fit-guide')
    fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'sizes' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Size guide' } })
    expect(screen.getByLabelText('Web address')).toHaveValue('sizes')

    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: '## Shirts\n\n- **M**: chest 40\n\n<script>alert(1)</script>' },
    })
    const preview = within(screen.getByRole('region', { name: 'Preview' }))
    expect(preview.getByRole('heading', { name: 'Shirts' })).toBeInTheDocument()
    expect(preview.getByRole('listitem')).toHaveTextContent('M: chest 40')
    expect(screen.getByRole('region', { name: 'Preview' }).querySelector('script')).toBeNull()
  })

  it('checked before sending (an address the shop uses); Publish creates it published and opens it', async () => {
    mocked.createPage.mockResolvedValue(ok(at({ id: 'new1', status: 'PUBLISHED' })))
    render(<NewPage />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Cart' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Web address: The shop already uses this address',
    )
    expect(mocked.createPage).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'cart-help' } })
    fireEvent.change(screen.getByLabelText('Google title'), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(mocked.createPage).toHaveBeenCalledWith({
        title: 'Cart',
        slug: 'cart-help',
        content: '',
        seoTitle: null,
        seoDescription: null,
        status: 'PUBLISHED',
      }),
    )
    expect(push).toHaveBeenCalledWith('/admin/content/pages/new1')
  })

  it('the API’s refusal is shown (e.g. the address is taken)', async () => {
    mocked.createPage.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'SLUG_TAKEN',
      message: 'Another page already uses /about. Choose another address.',
    })
    render(<NewPage />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'About' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Another page already uses /about')
    expect(push).not.toHaveBeenCalled()
  })
})

describe('edit page', () => {
  it('draft: Save draft keeps it a draft; Publish publishes and the buttons change', async () => {
    render(<EditPage id="p1" />)
    const text = await screen.findByLabelText('Text')
    expect(screen.getByLabelText('Web address')).toHaveValue('return-policy')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Returns' } })
    expect(screen.getByLabelText('Web address')).toHaveValue('return-policy') // saved pages keep their address
    fireEvent.change(text, { target: { value: 'Within 14 days.' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(mocked.updatePage).toHaveBeenCalledWith('p1', {
        title: 'Returns',
        slug: 'return-policy',
        content: 'Within 14 days.',
        seoTitle: null,
        seoDescription: null,
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Draft saved')
    expect(screen.queryByText('Unsaved changes')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(mocked.updatePage).toHaveBeenLastCalledWith(
        'p1',
        expect.objectContaining({ status: 'PUBLISHED' }),
      ),
    )
    expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View on the shop' })).toHaveAttribute(
      'href',
      'http://localhost:3000/return-policy',
    )
  })

  it('published: Save is off until something changes; a new address warns about old links; Unpublish', async () => {
    mocked.fetchPage.mockResolvedValue(ok(at({ status: 'PUBLISHED' })))
    render(<EditPage id="p1" />)
    const save = await screen.findByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Web address'), { target: { value: 'returns' } })
    expect(
      screen.getByText(/Old links to \/return-policy will lead here automatically/),
    ).toBeInTheDocument()
    expect(save).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }))
    await waitFor(() =>
      expect(mocked.updatePage).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ slug: 'returns', status: 'DRAFT' }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Unpublished')
  })

  it('archive asks first; then restore as draft', async () => {
    mocked.archivePage.mockResolvedValue(ok(at({ status: 'ARCHIVED' })))
    render(<EditPage id="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    const confirm = screen.getByRole('group', { name: 'Confirm archiving the page' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep it' }))
    expect(mocked.archivePage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, archive' }))
    await waitFor(() => expect(mocked.archivePage).toHaveBeenCalledWith('p1'))
    expect(await screen.findByText(/Archived — not on the shop/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Restore as draft' }))
    await waitFor(() =>
      expect(mocked.updatePage).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ status: 'DRAFT' }),
      ),
    )
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument()
  })
})
