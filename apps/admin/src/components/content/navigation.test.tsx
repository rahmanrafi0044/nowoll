import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as api from '@/lib/content-api'
import type { AdminContentBlock } from '@/lib/content-api'
import * as products from '@/lib/products-api'
import { FooterEditor } from './footer-editor'
import { MenuEditor } from './menu-editor'

vi.mock('@/lib/content-api', () => ({
  fetchContentBlock: vi.fn(),
  saveContentBlock: vi.fn(),
  clearContentBlock: vi.fn(),
  uploadContentImage: vi.fn(),
}))
vi.mock('@/lib/products-api', () => ({ fetchShopCategories: vi.fn() }))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const MEN = '0f8fad5b-d9cb-469f-a165-70867728950e'
const PANJABI = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const WOMEN = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
const block = (key: api.ContentKey, data: unknown = null): AdminContentBlock => ({
  key,
  data,
  isActive: data !== null,
  valid: true,
  updatedAt: data === null ? null : '2026-10-10T08:00:00Z',
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(products.fetchShopCategories).mockResolvedValue(
    ok([
      {
        id: MEN,
        name: 'Men',
        slug: 'men',
        children: [{ id: PANJABI, name: 'Panjabi', slug: 'panjabi' }],
      },
      { id: WOMEN, name: 'Women', slug: 'women' },
    ]),
  )
  mocked.saveContentBlock.mockImplementation(async (key, data) => ok(block(key, data)))
})

describe('menu editor (step 38b)', () => {
  const preview = () => within(screen.getByRole('region', { name: 'Menu preview' }))

  it('nothing saved: starts as today’s menu (Shop all + top-level categories)', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block('main_menu')))
    render(<MenuEditor />)
    await screen.findByRole('region', { name: 'Menu preview' })
    expect(
      preview()
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Shop all', 'Men', 'Women'])
  })

  it('add a subcategory with its own label and a "Sale" link, reorder, save', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block('main_menu')))
    render(<MenuEditor />)
    await screen.findByRole('region', { name: 'Menu preview' })
    fireEvent.change(screen.getByLabelText('Add a menu item'), { target: { value: 'category' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const items = () =>
      screen.getAllByRole('listitem').filter((li) => li.parentElement?.tagName === 'OL')
    const cat = within(items()[3]!)
    fireEvent.change(cat.getByLabelText('Category'), { target: { value: PANJABI } })
    fireEvent.change(cat.getByLabelText('Label (optional)'), { target: { value: 'Eid Panjabi' } })
    fireEvent.change(screen.getByLabelText('Add a menu item'), { target: { value: 'link' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const link = within(items()[4]!)
    fireEvent.change(link.getByLabelText('Label'), { target: { value: 'Sale' } })
    fireEvent.change(link.getByLabelText('Link'), { target: { value: '/shop?tag=sale' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move Sale up' }))
    expect(
      preview()
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Shop all', 'Men', 'Women', 'Sale', 'Eid Panjabi'])
    fireEvent.click(screen.getByRole('button', { name: 'Save menu' }))
    await waitFor(() => expect(mocked.saveContentBlock).toHaveBeenCalled())
    const [key, data, on] = mocked.saveContentBlock.mock.calls[0]!
    expect([key, on]).toEqual(['main_menu', true])
    expect((data as { items: unknown[] }).items.slice(3)).toEqual([
      expect.objectContaining({ kind: 'link', label: 'Sale', href: '/shop?tag=sale' }),
      expect.objectContaining({ kind: 'category', categoryId: PANJABI, label: 'Eid Panjabi' }),
    ])
  })

  it('checked before sending: a javascript: link, a category not chosen', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block('main_menu', { items: [] })))
    render(<MenuEditor />)
    await screen.findByRole('region', { name: 'Menu preview' })
    fireEvent.change(screen.getByLabelText('Add a menu item'), { target: { value: 'link' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Win' } })
    fireEvent.change(screen.getByLabelText('Link'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.change(screen.getByLabelText('Add a menu item'), { target: { value: 'category' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save menu' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Item 1:')
    expect(alert).toHaveTextContent('Item 2: Choose a category')
    expect(mocked.saveContentBlock).not.toHaveBeenCalled()
  })

  it('a saved category that is now hidden is flagged; reset asks first, then goes back to the standard menu', async () => {
    mocked.fetchContentBlock.mockResolvedValue(
      ok(
        block('main_menu', {
          items: [
            {
              id: 'x',
              kind: 'category',
              categoryId: '00000000-0000-4000-8000-000000000000',
              label: null,
            },
          ],
        }),
      ),
    )
    mocked.clearContentBlock.mockResolvedValue(ok(block('main_menu')))
    render(<MenuEditor />)
    expect(await screen.findByText('(hidden or archived — not shown)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to the standard menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep my menu' }))
    expect(mocked.clearContentBlock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to the standard menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, reset' }))
    await waitFor(() => expect(mocked.clearContentBlock).toHaveBeenCalledWith('main_menu'))
  })
})

describe('footer editor (step 38b)', () => {
  it('about text, a column with links, payment badges, copyright with {year} preview — saved', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block('footer')))
    render(<FooterEditor />)
    fireEvent.change(await screen.findByLabelText('About text (optional)'), {
      target: { value: 'Made in Dhaka.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add a column' }))
    fireEvent.change(screen.getByLabelText('Column 1 title'), { target: { value: 'Help' } })
    fireEvent.change(screen.getByLabelText('Link 1 text'), { target: { value: 'Returns' } })
    fireEvent.change(screen.getByLabelText('Link 1 address'), {
      target: { value: '/return-policy' },
    })
    fireEvent.click(screen.getByLabelText('Visa'.toUpperCase()))
    fireEvent.click(screen.getByLabelText('Cash on delivery'))
    fireEvent.change(screen.getByLabelText('Copyright line (optional)'), {
      target: { value: '© {year} Nowoll Ltd.' },
    })
    expect(screen.getByLabelText('Copyright preview')).toHaveTextContent(
      `Preview: © ${new Date().getFullYear()} Nowoll Ltd.`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save footer' }))
    await waitFor(() =>
      expect(mocked.saveContentBlock).toHaveBeenCalledWith(
        'footer',
        {
          about: 'Made in Dhaka.',
          columns: [
            {
              id: expect.any(String),
              title: 'Help',
              links: [{ label: 'Returns', href: '/return-policy' }],
            },
          ],
          autoPages: true,
          payments: ['cod', 'visa'], // the fixed list's order
          copyright: '© {year} Nowoll Ltd.',
        },
        true,
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  })

  it('a column without a title or link address is refused before sending; at most 3 columns', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block('footer')))
    render(<FooterEditor />)
    const add = await screen.findByRole('button', { name: 'Add a column' })
    fireEvent.click(add)
    fireEvent.click(screen.getByRole('button', { name: 'Save footer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Column 1: Write a column title')
    fireEvent.click(screen.getByRole('button', { name: 'Add a column' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a column' }))
    expect(screen.queryByRole('button', { name: 'Add a column' })).toBeNull()
    expect(mocked.saveContentBlock).not.toHaveBeenCalled()
  })
})
