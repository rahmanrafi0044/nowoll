import type { CategoryNode } from '@nowoll/types'
import { footerSchema, publicSettings, SETTING_DEFAULTS } from '@nowoll/validation'
import { render, screen, within } from '@testing-library/react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { copyrightLine, footerColumns, menuLinks, readFooter, readMenu } from './navigation'

const node = (id: string, name: string, children: CategoryNode[] = []): CategoryNode => ({
  id,
  name,
  slug: name.toLowerCase(),
  description: null,
  imageUrl: null,
  imageAlt: null,
  seoTitle: null,
  seoDescription: null,
  children,
})
const MEN = '0f8fad5b-d9cb-469f-a165-70867728950e'
const PANJABI = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const GONE = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
const TREE = [node(MEN, 'Men', [node(PANJABI, 'Panjabi')]), node('w', 'Women')]

describe('main menu (step 38b)', () => {
  it('nothing saved → "Shop all" + the top-level categories (as before)', () => {
    expect(menuLinks(null, TREE).map((l) => [l.label, l.href])).toEqual([
      ['Shop all', '/shop'],
      ['Men', '/shop/men'],
      ['Women', '/shop/women'],
    ])
  })

  it('saved: in its order; a subcategory by id with its own label; custom links; a hidden category drops out', () => {
    const menu = readMenu({
      items: [
        { id: 'eid', kind: 'category', categoryId: PANJABI, label: 'Eid Panjabi' },
        { id: 'sale', kind: 'link', label: 'Sale', href: '/shop?tag=sale' },
        { id: 'gone', kind: 'category', categoryId: GONE },
        { id: 'all', kind: 'shop_all', label: 'Everything' },
        { id: 'fb', kind: 'link', label: 'Our Facebook', href: 'https://www.facebook.com/nowoll' },
      ],
    })
    const links = menuLinks(menu, TREE)
    expect(links.map((l) => [l.label, l.href, l.external])).toEqual([
      ['Eid Panjabi', '/shop/panjabi', false],
      ['Sale', '/shop?tag=sale', false],
      ['Everything', '/shop', false],
      ['Our Facebook', 'https://www.facebook.com/nowoll', true],
    ])
  })

  it('a stored menu that no longer fits the format is ignored (the standard menu instead)', () => {
    expect(readMenu({ items: [{ id: 'x', kind: 'dropdown' }] })).toBeNull()
  })

  it('header: other sites open in a new tab', () => {
    render(
      <SiteHeader
        storeName="Nowoll"
        links={menuLinks(
          readMenu({
            items: [
              { id: 'fb', kind: 'link', label: 'Facebook', href: 'https://www.facebook.com/x' },
            ],
          }),
          TREE,
        )}
      />,
    )
    const fb = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
      name: 'Facebook',
    })
    expect(fb).toHaveAttribute('target', '_blank')
    expect(fb).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('footer (step 38b)', () => {
  const pages = [{ slug: 'faq', title: 'FAQ' }]
  const settings = publicSettings(SETTING_DEFAULTS)

  it('columns, then the automatic "Information" column; switched off → only the columns', () => {
    const footer = readFooter({
      columns: [{ id: 'c', title: 'Shop', links: [{ label: 'Sale', href: '/shop?tag=sale' }] }],
    })
    expect(footerColumns(footer, pages).map((c) => [c.title, c.links.map((l) => l.label)])).toEqual(
      [
        ['Shop', ['Sale']],
        ['Information', ['Track your order', 'FAQ']],
      ],
    )
    expect(footerColumns({ ...footer, autoPages: false }, pages)).toHaveLength(1)
    expect(footerColumns(readFooter(null), pages)[0]!.title).toBeNull() // as before: one untitled list
  })

  it('copyright: {year} filled in; empty → the standard line', () => {
    expect(copyrightLine(readFooter({ copyright: '© {year} Nowoll Ltd.' }), 'Nowoll', 2026)).toBe(
      '© 2026 Nowoll Ltd.',
    )
    expect(copyrightLine(readFooter(null), 'Nowoll', 2026)).toBe(
      '© 2026 Nowoll. All prices in BDT (৳).',
    )
  })

  it('renders about text (as text, never HTML), columns, payment badges and the line', () => {
    const footer = readFooter({
      about: 'Made in Dhaka. <b>Hi</b>',
      columns: [{ id: 'c', title: 'Help', links: [{ label: 'Returns', href: '/return-policy' }] }],
      payments: ['cod', 'bkash', 'visa'],
      copyright: '© {year} Nowoll',
    })
    const { container } = render(<SiteFooter pages={pages} settings={settings} footer={footer} />)
    expect(screen.getByText('Made in Dhaka. <b>Hi</b>')).toBeInTheDocument()
    expect(container.querySelector('footer b')).toBeNull()
    expect(
      within(screen.getByRole('navigation', { name: 'Help' })).getByRole('link', {
        name: 'Returns',
      }),
    ).toHaveAttribute('href', '/return-policy')
    expect(
      within(screen.getByRole('list', { name: 'We accept' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Cash on delivery', 'bKash', 'VISA'])
    expect(screen.getByText(/^© \d{4} Nowoll$/)).toBeInTheDocument()
  })

  it('no badges chosen → no "We accept" row', () => {
    render(<SiteFooter pages={pages} settings={settings} footer={footerSchema.parse({})} />)
    expect(screen.queryByRole('list', { name: 'We accept' })).toBeNull()
  })
})
