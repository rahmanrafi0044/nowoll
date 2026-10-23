import type { CategoryNode, PageLinkView } from '@nowoll/types'
import {
  type Footer,
  footerSchema,
  type MainMenu,
  mainMenuSchema,
  PAYMENT_BADGES,
  type PaymentBadge,
} from '@nowoll/validation'

// ============================================================================
// The header menu and the footer's links (Admin → Content → Menu / Footer,
// step 38b). Nothing saved → exactly the menu and footer from before:
// "Shop all" + every visible top-level category; "Track your order" + the
// published pages.
// ============================================================================

export interface NavLink {
  key: string
  label: string
  href: string
  /** A full https:// link to another site — opens in a new tab. */
  external: boolean
  /** A category's subcategories — the desktop drop-down and the phone menu show them. */
  children: NavLink[]
  /** A category's photo (Admin → Categories) — shown in the drop-down menu (38f). */
  imageUrl?: string | null
  imageAlt?: string | null
}

const categoryLink = (c: CategoryNode, label?: string | null): NavLink => ({
  key: `category-${c.id}`,
  label: label || c.name,
  href: `/shop/${c.slug}`,
  external: false,
  children: (c.children ?? []).map((k) => categoryLink(k)),
  imageUrl: c.imageUrl,
  imageAlt: c.imageAlt ?? c.name,
})

const SHOP_ALL = (label?: string | null): NavLink => ({
  key: 'shop-all',
  label: label || 'Shop all',
  href: '/shop',
  external: false,
  children: [],
})

/** The saved block, if it still fits the format (the API checks it too). */
export const readMenu = (data: unknown): MainMenu | null => {
  const parsed = mainMenuSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export const readFooter = (data: unknown): Footer => {
  const parsed = footerSchema.safeParse(data ?? {})
  return parsed.success ? parsed.data : footerSchema.parse({})
}

/** The visible categories are the shop's own tree (hidden ones are never in it). */
function findCategory(nodes: CategoryNode[], id: string): CategoryNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findCategory(n.children ?? [], id)
    if (found) return found
  }
  return undefined
}

/** The header menu's links. A category that is hidden or archived simply drops out. */
export function menuLinks(menu: MainMenu | null, categories: CategoryNode[]): NavLink[] {
  if (!menu) return [SHOP_ALL(), ...categories.map((c) => categoryLink(c))]
  return menu.items.flatMap((item): NavLink[] => {
    switch (item.kind) {
      case 'shop_all':
        return [{ ...SHOP_ALL(item.label), key: item.id }]
      case 'category': {
        const c = findCategory(categories, item.categoryId)
        return c ? [{ ...categoryLink(c, item.label), key: item.id }] : []
      }
      case 'link':
        return [
          {
            key: item.id,
            label: item.label,
            href: item.href,
            external: item.href.startsWith('https://'),
            children: [],
          },
        ]
    }
  })
}

export interface FooterColumn {
  key: string
  title: string | null
  links: NavLink[]
}

const link = (label: string, href: string): NavLink => ({
  key: `${label}-${href}`,
  label,
  href,
  external: href.startsWith('https://'),
  children: [],
})

/** The footer's link columns: the admin's columns, then (if on) the help + pages column. */
export function footerColumns(
  footer: Footer,
  pages: PageLinkView[],
  /** Step 43: at least one blog post is live → a "Blog" link. */
  hasBlog = false,
): FooterColumn[] {
  const columns: FooterColumn[] = footer.columns.map((c) => ({
    key: c.id,
    title: c.title,
    links: c.links.map((l) => link(l.label, l.href)),
  }))
  // Before step 38b the footer had exactly this list — still the default.
  const auto = footer.autoPages
    ? [
        link('Track your order', '/orders/track'),
        ...(hasBlog ? [link('Blog', '/blog')] : []),
        ...pages.map((p) => link(p.title, `/${p.slug}`)),
      ]
    : []
  if (auto.length > 0)
    columns.push({
      key: 'auto-pages',
      title: columns.length > 0 ? 'Information' : null,
      links: auto,
    })
  return columns
}

/** The bottom line: the admin's text with {year}, or the standard one. */
export function copyrightLine(footer: Footer, storeName: string, year: number): string {
  return footer.copyright
    ? footer.copyright.replaceAll('{year}', String(year))
    : `© ${year} ${storeName}. All prices in BDT (৳).`
}

export const paymentBadges = (keys: PaymentBadge[]) =>
  PAYMENT_BADGES.filter((b) => keys.includes(b.key))
