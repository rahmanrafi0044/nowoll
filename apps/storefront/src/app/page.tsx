import type { CategoryNode, Paginated, ProductCardView } from '@nowoll/types'
import {
  DEFAULT_HOMEPAGE_LAYOUT,
  type HomepageHero,
  type HomepageSection,
  readHomepageLayout,
} from '@nowoll/validation'
import type { Metadata } from 'next'
import { CategoryGrid } from '@/components/home/category-grid'
import { Hero } from '@/components/home/hero'
import { NewsletterSection } from '@/components/home/newsletter-section'
import { ProductSection } from '@/components/home/product-section'
import { PromoBanners } from '@/components/home/promo-banners'
import { TrustBadges } from '@/components/home/trust-badges'
import { apiGet } from '@/lib/api'
import { publicEnv } from '@/lib/env'
import { JsonLd } from '@/lib/json-ld'

// ISR: Next.js serves a ready-made page and rebuilds it in the background at
// most every 60 seconds (spec: "SSG + ISR (60s)").
export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: 'Nowoll — always new' },
    description:
      'Everyday clothing for Bangladesh — shirts, panjabi, kurti and more, delivered nationwide.',
    alternates: { canonical: '/' },
  }
}

type Section = HomepageSection

/** The product list a section shows (null = it shows no products). Same queries as before step 36. */
function productQuery(s: Section): string | null {
  switch (s.type) {
    case 'featured':
      return 'featured=true&pageSize=8'
    case 'new_arrivals':
      return 'sort=newest&pageSize=8'
    case 'products':
      return s.source.kind === 'category'
        ? `category=${encodeURIComponent(s.source.slug)}&pageSize=${s.limit}`
        : `tag=${encodeURIComponent(s.source.tag)}&pageSize=${s.limit}`
    default:
      return null
  }
}

/** Where a product row's "View all" goes. */
function viewAllHref(s: Section): string {
  if (s.type === 'featured') return '/shop?featured=true'
  if (s.type === 'products')
    return s.source.kind === 'category'
      ? `/shop/${s.source.slug}`
      : `/shop?tag=${encodeURIComponent(s.source.tag)}`
  return '/shop'
}

// ============================================================================
// The homepage is built from the admin's homepage builder (step 36): an
// ordered list of sections, each shown or hidden. Nothing saved yet (or the
// layout switched off) → DEFAULT_HOMEPAGE_LAYOUT, i.e. exactly the homepage
// from before step 36. One broken section hides only itself.
// ============================================================================
export default async function HomePage() {
  // The layout, hero and categories at the same time…
  const [layoutBlock, hero, categories] = await Promise.all([
    apiGet<{ data: unknown }>('/content-blocks/homepage_layout'),
    apiGet<{ data: HomepageHero }>('/content-blocks/homepage_hero'),
    apiGet<CategoryNode[]>('/categories'),
  ])
  const layout = layoutBlock ? readHomepageLayout(layoutBlock.data) : DEFAULT_HOMEPAGE_LAYOUT
  const sections = layout.sections.filter((s) => s.visible)

  // …then every product row's products, also at the same time.
  const products = await Promise.all(
    sections.map((s) => {
      const q = productQuery(s)
      return q ? apiGet<Paginated<ProductCardView>>(`/products?${q}`) : Promise.resolve(null)
    }),
  )

  // The first picture-heavy section loads its images first (Largest Contentful Paint).
  const heroFirst = sections[0]?.type === 'hero' && !!hero
  const priorityIndex = heroFirst ? -1 : products.findIndex((p) => (p?.items.length ?? 0) > 0)

  return (
    <>
      <OrganizationJsonLd />
      {sections.map((s, i) => {
        switch (s.type) {
          case 'hero':
            return hero ? <Hero key={s.id} data={hero.data} /> : null
          case 'categories':
            return (
              <CategoryGrid
                key={s.id}
                id={s.id}
                title={s.title ?? 'Shop by category'}
                categories={categories ?? []}
              />
            )
          case 'featured':
          case 'new_arrivals':
          case 'products': {
            const items = products[i]?.items ?? []
            const priority = i === priorityIndex
            const title =
              s.type === 'products'
                ? s.title
                : (s.title ?? (s.type === 'featured' ? 'Featured' : 'New arrivals'))
            return (
              <ProductSection
                key={s.id}
                id={s.id}
                title={title}
                products={items}
                viewAllHref={viewAllHref(s)}
                priority={priority}
              />
            )
          }
          case 'banners':
            return <PromoBanners key={s.id} id={s.id} banners={s.banners} />
          case 'trust_badges':
            return <TrustBadges key={s.id} id={s.id} badges={s.badges} />
          case 'newsletter':
            return <NewsletterSection key={s.id} />
        }
      })}
    </>
  )
}

/** Organization structured data: tells Google who the store is (CLAUDE.md §13). */
function OrganizationJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Nowoll',
        slogan: 'always new',
        url: publicEnv.siteUrl,
      }}
    />
  )
}
