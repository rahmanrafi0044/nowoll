import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DEFAULT_HOMEPAGE_LAYOUT } from '@nowoll/validation'
import * as api from '@/lib/content-api'
import type { AdminContentBlock } from '@/lib/content-api'
import * as products from '@/lib/products-api'
import { AnnouncementEditor } from './announcement-editor'
import { HomepageEditor } from './homepage-editor'
import { move, newSection } from './layout-editor'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/content',
}))
vi.mock('@/lib/content-api', () => ({
  fetchContentBlocks: vi.fn(),
  fetchContentBlock: vi.fn(),
  saveContentBlock: vi.fn(),
  clearContentBlock: vi.fn(),
  uploadContentImage: vi.fn(),
}))
vi.mock('@/lib/products-api', () => ({ fetchShopCategories: vi.fn() }))
const mocked = vi.mocked(api)
const ok = <T,>(data: T) => ({ ok: true as const, data })

const block = (
  key: api.ContentKey,
  data: unknown = null,
  more: Partial<AdminContentBlock> = {},
) => ({
  key,
  data,
  isActive: data !== null,
  valid: true,
  updatedAt: data === null ? null : '2026-10-09T08:00:00Z',
  ...more,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(products.fetchShopCategories).mockResolvedValue(
    ok([
      {
        id: 'c1',
        name: 'Men',
        slug: 'men',
        children: [{ id: 'c2', name: 'Panjabi', slug: 'panjabi' }],
      },
    ]),
  )
  mocked.saveContentBlock.mockImplementation(async (key, data, isActive) =>
    ok(block(key, data, { isActive, updatedAt: '2026-10-09T09:00:00Z' })),
  )
})

describe('layout helpers', () => {
  it('move swaps with the neighbour, without touching the original list', () => {
    const list = ['a', 'b', 'c']
    expect(move(list, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(move(list, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('new sections get their own ids and sensible starting values', () => {
    const a = newSection('products')
    const b = newSection('products')
    expect(a.id).not.toBe(b.id)
    expect(a).toMatchObject({ type: 'products', visible: true, limit: 8, source: { kind: 'tag' } })
    expect(newSection('trust_badges')).toMatchObject({
      badges: expect.arrayContaining([{ icon: 'cash', text: 'Cash on delivery' }]),
    })
    // 38f: the new kinds start empty but shaped right (circles need at least 2).
    expect(newSection('split')).toMatchObject({ type: 'split', imageSide: 'left', heading: '' })
    expect(newSection('circles')).toMatchObject({ type: 'circles', items: [{}, {}] })
    expect(newSection('story')).toMatchObject({ type: 'story', imageUrl: null })
  })
})

describe('announcement bar', () => {
  it('nothing saved: starts on; refuses an empty text; saves text + link; preview follows the text', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block('announcement_bar')))
    render(<AnnouncementEditor />)
    const text = await screen.findByLabelText('Text')
    expect(screen.getByLabelText('Show it on the shop')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Write the announcement')
    expect(mocked.saveContentBlock).not.toHaveBeenCalled()

    fireEvent.change(text, { target: { value: 'Eid sale — 20% off' } })
    fireEvent.change(screen.getByLabelText('Link (optional)'), {
      target: { value: ' /shop?tag=eid ' },
    })
    expect(screen.getByLabelText('Preview of the announcement bar')).toHaveTextContent(
      'Eid sale — 20% off',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.saveContentBlock).toHaveBeenCalledWith(
        'announcement_bar',
        { text: 'Eid sale — 20% off', href: '/shop?tag=eid', more: [] }, // 38f: no extra messages
        true,
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
  })

  it('38f: extra messages take turns — filled ones are saved, empty ones skipped', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block('announcement_bar')))
    render(<AnnouncementEditor />)
    fireEvent.change(await screen.findByLabelText('Text'), { target: { value: 'Free delivery' } })
    fireEvent.change(screen.getByLabelText('Message 3'), { target: { value: 'New: Eid edit' } })
    fireEvent.change(screen.getByLabelText('Message 3 link (optional)'), {
      target: { value: '/shop/eid' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocked.saveContentBlock).toHaveBeenCalledWith(
        'announcement_bar',
        { text: 'Free delivery', href: null, more: [{ text: 'New: Eid edit', href: '/shop/eid' }] },
        true,
      ),
    )
  })

  it('switched off is kept off; the API’s problems are listed', async () => {
    mocked.fetchContentBlock.mockResolvedValue(
      ok(block('announcement_bar', { text: 'Old', href: null }, { isActive: false })),
    )
    mocked.saveContentBlock.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'INVALID_CONTENT',
      message: 'Some fields need fixing.',
      details: ['href › Use a link on this shop or https://'],
    })
    render(<AnnouncementEditor />)
    expect(await screen.findByLabelText('Show it on the shop')).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Some fields need fixing.')
    expect(alert).toHaveTextContent('href › Use a link on this shop or https://')
    expect(mocked.saveContentBlock).toHaveBeenCalledWith(
      'announcement_bar',
      { text: 'Old', href: null, more: [] },
      false,
    )
  })
  it('Clear + Save removes the announcement: asks first, then deletes its words (soft clear in the API)', async () => {
    mocked.fetchContentBlock.mockResolvedValue(
      ok(block('announcement_bar', { text: 'Eid sale', href: '/shop' })),
    )
    mocked.clearContentBlock.mockResolvedValue(
      ok(block('announcement_bar', null, { updatedAt: '2026-10-09T10:00:00Z' })),
    )
    render(<AnnouncementEditor />)
    const text = await screen.findByLabelText('Text')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(text).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const confirm = screen.getByRole('group', { name: 'Confirm removing the announcement' })
    expect(confirm).toHaveTextContent('its words are deleted')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep it' }))
    expect(mocked.clearContentBlock).not.toHaveBeenCalled()
    expect(mocked.saveContentBlock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    await waitFor(() => expect(mocked.clearContentBlock).toHaveBeenCalledWith('announcement_bar'))
    expect(await screen.findByRole('status')).toHaveTextContent('Removed')
    expect(text).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Hide from the shop' })).toBeNull()
    // Nothing saved any more → an empty Save is just "write something".
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Write the announcement')
    expect(mocked.clearContentBlock).toHaveBeenCalledTimes(1)
  })

  it('a link without words is not a removal — it asks for the words', async () => {
    mocked.fetchContentBlock.mockResolvedValue(
      ok(block('announcement_bar', { text: 'Old', href: null })),
    )
    render(<AnnouncementEditor />)
    fireEvent.change(await screen.findByLabelText('Text'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Link (optional)'), { target: { value: '/shop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Write the announcement')
    expect(screen.queryByRole('group', { name: /^Confirm/ })).toBeNull()
  })

  it('hide from the shop: asks first, re-saves the LATEST saved words switched off (not half-typed edits)', async () => {
    mocked.fetchContentBlock.mockResolvedValue(
      ok(block('announcement_bar', { text: 'Eid sale', href: '/shop' })),
    )
    render(<AnnouncementEditor />)
    const text = await screen.findByLabelText('Text')
    // Save new words first: Hide must use THESE, not what the page opened with.
    fireEvent.change(text, { target: { value: 'Puja sale' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('status')
    fireEvent.change(text, { target: { value: 'Half-typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hide from the shop' }))
    const confirm = screen.getByRole('group', { name: 'Confirm hiding the announcement' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep it showing' }))
    expect(mocked.saveContentBlock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Hide from the shop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, hide it' }))
    await waitFor(() =>
      expect(mocked.saveContentBlock).toHaveBeenLastCalledWith(
        'announcement_bar',
        { text: 'Puja sale', href: '/shop', more: [] },
        false,
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Hidden')
    expect(screen.getByLabelText('Show it on the shop')).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Hide from the shop' })).toBeNull()
    expect(mocked.clearContentBlock).not.toHaveBeenCalled()
  })

  it('hide is offered only while the bar is on the shop; Clear empties the boxes without saving', async () => {
    mocked.fetchContentBlock.mockResolvedValue(
      ok(block('announcement_bar', { text: 'Old', href: '/shop' }, { isActive: false })),
    )
    render(<AnnouncementEditor />)
    const text = await screen.findByLabelText('Text')
    expect(screen.queryByRole('button', { name: 'Hide from the shop' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(text).toHaveValue('')
    expect(screen.getByLabelText('Link (optional)')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
    expect(mocked.saveContentBlock).not.toHaveBeenCalled()
  })

  it('switching it on by saving offers Hide straight away', async () => {
    mocked.fetchContentBlock.mockResolvedValue(ok(block('announcement_bar')))
    render(<AnnouncementEditor />)
    fireEvent.change(await screen.findByLabelText('Text'), { target: { value: 'Hello' } })
    expect(screen.queryByRole('button', { name: 'Hide from the shop' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Hide from the shop' })).toBeInTheDocument()
  })
})

describe('homepage', () => {
  const load = (layout: unknown = null, more: Partial<AdminContentBlock> = {}) =>
    mocked.fetchContentBlocks.mockResolvedValue(
      ok([
        block('announcement_bar'),
        block('homepage_hero'),
        block('homepage_layout', layout, more),
      ]),
    )
  const sections = () => within(screen.getByRole('region', { name: 'Sections' }))
  const items = () =>
    sections()
      .getAllByRole('listitem')
      .filter((li) => li.parentElement?.tagName === 'OL')
  const titles = () => items().map((li) => li.querySelector('span')!.textContent)
  const savedLayout = () =>
    mocked.saveContentBlock.mock.calls.find((c) => c[0] === 'homepage_layout')?.[1] as {
      sections: { id: string; type: string; visible: boolean }[]
    }

  it('nothing saved: shows today’s homepage; Save is off until something changes', async () => {
    load()
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    expect(titles()).toEqual([
      '1. Hero (big banner)',
      '2. Categories',
      '3. Featured products',
      '4. New arrivals',
      '5. Newsletter sign-up',
    ])
    expect(sections().getByRole('button', { name: 'Save sections' })).toBeDisabled()
    expect(sections().getByRole('button', { name: 'Move Hero (big banner) up' })).toBeDisabled()
    expect(sections().getByRole('button', { name: 'Move Newsletter sign-up down' })).toBeDisabled()
  })

  it('move, hide and save: the whole list goes to the API in the new order', async () => {
    load()
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    fireEvent.click(sections().getByRole('button', { name: 'Move New arrivals up' }))
    fireEvent.click(sections().getByRole('button', { name: 'Move New arrivals up' }))
    fireEvent.click(within(items()[3]!).getByLabelText('Show')) // featured, now 4th
    expect(titles()[1]).toBe('2. New arrivals')
    expect(sections().getByText('Unsaved changes')).toBeInTheDocument()
    fireEvent.click(sections().getByRole('button', { name: 'Save sections' }))
    await waitFor(() => expect(savedLayout()).toBeDefined())
    expect(savedLayout().sections.map((s) => [s.type, s.visible])).toEqual([
      ['hero', true],
      ['new_arrivals', true],
      ['categories', true],
      ['featured', false],
      ['newsletter', true],
    ])
    expect(mocked.saveContentBlock.mock.calls[0]![2]).toBe(true)
  })

  it('add a product row from a category (stored by its web address), and trust badges', async () => {
    load()
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    // One of each built-in only: those already on the page can't be added again.
    const add = sections().getByLabelText('Add a section')
    expect(within(add).queryByRole('option', { name: 'Hero (big banner)' })).toBeNull()
    fireEvent.change(add, { target: { value: 'products' } })
    fireEvent.click(sections().getByRole('button', { name: 'Add' }))
    const row = items()[5]!
    fireEvent.change(within(row).getByLabelText('Title'), { target: { value: 'Panjabi' } })
    fireEvent.change(within(row).getByLabelText('Products from'), { target: { value: 'category' } })
    await waitFor(() =>
      expect(within(row).getByRole('option', { name: 'Men › Panjabi' })).toBeInTheDocument(),
    )
    fireEvent.change(within(row).getByLabelText('Category'), { target: { value: 'panjabi' } })
    fireEvent.change(within(row).getByLabelText('How many products'), { target: { value: '4' } })

    fireEvent.change(add, { target: { value: 'trust_badges' } })
    fireEvent.click(sections().getByRole('button', { name: 'Add' }))
    fireEvent.click(sections().getByRole('button', { name: 'Save sections' }))
    await waitFor(() => expect(savedLayout()).toBeDefined())
    expect(savedLayout().sections.slice(5)).toEqual([
      expect.objectContaining({
        type: 'products',
        title: 'Panjabi',
        source: { kind: 'category', slug: 'panjabi' },
        limit: 4,
      }),
      expect.objectContaining({ type: 'trust_badges' }),
    ])
  })

  it('remove a section, then add it back; reset returns the standard homepage', async () => {
    load({ sections: [{ id: 'news', type: 'newsletter', visible: true }] })
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    expect(titles()).toEqual(['1. Newsletter sign-up'])
    fireEvent.click(sections().getByRole('button', { name: 'Remove Newsletter sign-up' }))
    expect(sections().getByText(/the homepage would be empty/)).toBeInTheDocument()
    fireEvent.click(sections().getByRole('button', { name: 'Reset to the standard homepage' }))
    expect(titles()).toHaveLength(DEFAULT_HOMEPAGE_LAYOUT.sections.length)
  })

  it('a saved layout that no longer fits: warned, the broken section left out', async () => {
    load(
      {
        sections: [
          { id: 'hero', type: 'hero' },
          { id: 'bad', type: 'banners', banners: [] },
        ],
      },
      { valid: false },
    )
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    expect(sections().getByText(/no longer fits the rules/)).toBeInTheDocument()
    expect(titles()).toEqual(['1. Hero (big banner)'])
  })

  it('banners: a picture is uploaded and kept; refusals from the API are shown', async () => {
    load({ sections: [] })
    mocked.uploadContentImage.mockResolvedValue(
      ok({ url: 'https://cdn.example/content/a.webp', width: 1200, height: 800 }),
    )
    mocked.saveContentBlock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'INVALID_CONTENT',
      message: 'Some fields need fixing.',
      details: ['sections › 0 › banners › 0 › imageAlt › Required'],
    })
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    fireEvent.change(sections().getByLabelText('Add a section'), { target: { value: 'banners' } })
    fireEvent.click(sections().getByRole('button', { name: 'Add' }))
    const file = new File([new Uint8Array(10)], 'eid.png', { type: 'image/png' })
    fireEvent.change(sections().getByLabelText(/Picture for banner 1/), {
      target: { files: [file] },
    })
    await waitFor(() => expect(mocked.uploadContentImage).toHaveBeenCalledWith(file))
    fireEvent.click(sections().getByRole('button', { name: 'Save sections' }))
    expect(await sections().findByRole('alert')).toHaveTextContent('imageAlt › Required')
    const sent = savedLayout() as unknown as { sections: { banners: { imageUrl: string }[] }[] }
    expect(sent.sections[0]!.banners[0]!.imageUrl).toBe('https://cdn.example/content/a.webp')
  })

  it('38f: a photo that finishes uploading keeps words typed meanwhile', async () => {
    load({ sections: [] })
    type Upload = Awaited<ReturnType<typeof api.uploadContentImage>>
    let finish: (v: Upload) => void = () => {}
    mocked.uploadContentImage.mockReturnValue(new Promise<Upload>((r) => (finish = r)))
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    fireEvent.change(sections().getByLabelText('Add a section'), { target: { value: 'split' } })
    fireEvent.click(sections().getByRole('button', { name: 'Add' }))
    const file = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })
    fireEvent.change(sections().getByLabelText(/^Photo \(required\)/), {
      target: { files: [file] },
    })
    // Typed while the upload is still going…
    fireEvent.change(sections().getByLabelText('Describe the photo'), {
      target: { value: 'Lawn three-piece' },
    })
    fireEvent.change(sections().getByLabelText('Heading'), { target: { value: 'Summer' } })
    finish(ok({ url: 'https://cdn.example/content/s.webp', width: 1200, height: 1500 }))
    await waitFor(() =>
      expect(sections().getByRole('button', { name: 'Remove picture' })).toBeInTheDocument(),
    )
    // …is still there after it finished.
    expect(sections().getByLabelText('Describe the photo')).toHaveValue('Lawn three-piece')
    fireEvent.click(sections().getByRole('button', { name: 'Save sections' }))
    await waitFor(() =>
      expect(savedLayout().sections[0]).toMatchObject({
        type: 'split',
        imageUrl: 'https://cdn.example/content/s.webp',
        imageAlt: 'Lawn three-piece',
        heading: 'Summer',
      }),
    )
  })

  it('38f: round photo links — at least 2, up to 6; brand story saves its words', async () => {
    load({ sections: [] })
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    fireEvent.change(sections().getByLabelText('Add a section'), { target: { value: 'circles' } })
    fireEvent.click(sections().getByRole('button', { name: 'Add' }))
    expect(sections().queryByRole('button', { name: /Remove circle/ })).toBeNull()
    fireEvent.click(sections().getByRole('button', { name: 'Add a circle' }))
    expect(sections().getByRole('button', { name: 'Remove circle 3' })).toBeInTheDocument()
    for (let n = 4; n <= 6; n++)
      fireEvent.click(sections().getByRole('button', { name: 'Add a circle' }))
    expect(sections().queryByRole('button', { name: 'Add a circle' })).toBeNull()

    fireEvent.change(sections().getByLabelText('Add a section'), { target: { value: 'story' } })
    fireEvent.click(sections().getByRole('button', { name: 'Add' }))
    fireEvent.change(sections().getByLabelText('Your story'), {
      target: { value: 'Made in Dhaka.' },
    })
    fireEvent.click(sections().getByRole('button', { name: 'Save sections' }))
    await waitFor(() =>
      expect(savedLayout().sections[1]).toMatchObject({ type: 'story', text: 'Made in Dhaka.' }),
    )
  })

  it('38f lookbook: 3 to 12 photos, reorderable; a photo upload keeps typed captions', async () => {
    load({ sections: [] })
    mocked.uploadContentImage.mockResolvedValue(
      ok({ url: 'https://cdn.example/content/look.webp', width: 1200, height: 1500 }),
    )
    render(<HomepageEditor />)
    await screen.findByRole('region', { name: 'Sections' })
    fireEvent.change(sections().getByLabelText('Add a section'), { target: { value: 'lookbook' } })
    fireEvent.click(sections().getByRole('button', { name: 'Add' }))
    expect(sections().queryByRole('button', { name: /Remove photo/ })).toBeNull() // 3 = the minimum
    fireEvent.change(sections().getByLabelText('Caption 1 (optional)'), {
      target: { value: '@nusrat' },
    })
    fireEvent.change(sections().getByLabelText('Caption 2 (optional)'), {
      target: { value: '@rima' },
    })
    fireEvent.click(sections().getByRole('button', { name: 'Move photo 2 earlier' }))
    const file = new File([new Uint8Array(10)], 'look.png', { type: 'image/png' })
    fireEvent.change(sections().getByLabelText(/Lookbook photo 1/), { target: { files: [file] } })
    await waitFor(() => expect(mocked.uploadContentImage).toHaveBeenCalled())
    for (let n = 4; n <= 12; n++)
      fireEvent.click(sections().getByRole('button', { name: 'Add a photo' }))
    expect(sections().queryByRole('button', { name: 'Add a photo' })).toBeNull()
    fireEvent.click(sections().getByRole('button', { name: 'Save sections' }))
    await waitFor(() => {
      const look = savedLayout().sections[0] as unknown as {
        type: string
        items: { caption: string | null; imageUrl: string }[]
      }
      expect(look.type).toBe('lookbook')
      expect(look.items).toHaveLength(12)
      expect(look.items.slice(0, 2)).toEqual([
        expect.objectContaining({
          caption: '@rima',
          imageUrl: 'https://cdn.example/content/look.webp',
        }),
        expect.objectContaining({ caption: '@nusrat', imageUrl: '' }),
      ])
    })
  })

  it('38f hero: extra slides are checked and saved; at most 3', async () => {
    load()
    render(<HomepageEditor />)
    const hero = within(await screen.findByRole('region', { name: 'Hero' }))
    fireEvent.change(hero.getByLabelText('Heading'), { target: { value: 'Always new' } })
    fireEvent.click(hero.getByRole('button', { name: 'Add a slide' }))
    fireEvent.click(hero.getByRole('button', { name: 'Save hero' }))
    expect(await hero.findByRole('alert')).toHaveTextContent('Slide 2: write a heading')
    fireEvent.change(hero.getByLabelText('Slide 2 heading'), { target: { value: 'Eid edit' } })
    fireEvent.click(hero.getByRole('button', { name: 'Add a slide' }))
    fireEvent.click(hero.getByRole('button', { name: 'Add a slide' }))
    expect(hero.queryByRole('button', { name: 'Add a slide' })).toBeNull()
    fireEvent.click(hero.getByRole('button', { name: 'Remove slide 4' }))
    fireEvent.click(hero.getByRole('button', { name: 'Remove slide 3' }))
    fireEvent.click(hero.getByRole('button', { name: 'Save hero' }))
    await waitFor(() =>
      expect(mocked.saveContentBlock).toHaveBeenCalledWith(
        'homepage_hero',
        expect.objectContaining({
          heading: 'Always new',
          more: [expect.objectContaining({ heading: 'Eid edit', ctaHref: '/shop' })],
        }),
        true,
      ),
    )
  })

  it('hero: saves heading and button; asks for a description when there is a picture', async () => {
    load()
    mocked.uploadContentImage.mockResolvedValue(
      ok({ url: 'https://cdn.example/content/h.webp', width: 1200, height: 800 }),
    )
    render(<HomepageEditor />)
    const hero = within(await screen.findByRole('region', { name: 'Hero' }))
    fireEvent.change(hero.getByLabelText('Heading'), { target: { value: 'Always new' } })
    const file = new File([new Uint8Array(10)], 'hero.png', { type: 'image/png' })
    fireEvent.change(hero.getByLabelText(/Background picture/), { target: { files: [file] } })
    await hero.findByLabelText('Describe the picture')
    fireEvent.click(hero.getByRole('button', { name: 'Save hero' }))
    expect(await hero.findByRole('alert')).toHaveTextContent('Describe the picture')
    expect(mocked.saveContentBlock).not.toHaveBeenCalled()
    fireEvent.change(hero.getByLabelText('Describe the picture'), {
      target: { value: 'Model in a navy panjabi' },
    })
    fireEvent.click(hero.getByRole('button', { name: 'Save hero' }))
    await waitFor(() =>
      expect(mocked.saveContentBlock).toHaveBeenCalledWith(
        'homepage_hero',
        {
          heading: 'Always new',
          subheading: null,
          ctaLabel: 'Shop now',
          ctaHref: '/shop',
          imageUrl: 'https://cdn.example/content/h.webp',
          imageAlt: 'Model in a navy panjabi',
          more: [],
        },
        true,
      ),
    )
  })
})
