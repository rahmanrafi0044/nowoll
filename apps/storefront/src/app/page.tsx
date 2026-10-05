import type { CategoryNode, Paginated, ProductCardView } from '@nowoll/types'
import type { HomepageHero } from '@nowoll/validation'
import type { Metadata } from 'next'
import { CategoryGrid } from '@/components/home/category-grid'
import { Hero } from '@/components/home/hero'
import { NewsletterSection } from '@/components/home/newsletter-section'
import { ProductSection } from '@/components/home/product-section'
import { apiGet } from '@/lib/api'
import { publicEnv } from '@/lib/env'

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

export default async function HomePage() {
  // All four requests run at the same time, not one after another.
  const [hero, categories, featured, newest] = await Promise.all([
    apiGet<{ data: HomepageHero }>('/content-blocks/homepage_hero'),
    apiGet<CategoryNode[]>('/categories'),
    apiGet<Paginated<ProductCardView>>('/products?featured=true&pageSize=8'),
    apiGet<Paginated<ProductCardView>>('/products?sort=newest&pageSize=8'),
  ])

  return (
    <>
      <OrganizationJsonLd />
      {hero && <Hero data={hero.data} />}
      <CategoryGrid categories={categories ?? []} />
      <ProductSection
        id="featured"
        title="Featured"
        products={featured?.items ?? []}
        viewAllHref="/shop?featured=true"
        priority={!hero} // without a hero, featured products are the first thing seen
      />
      <ProductSection
        id="new-arrivals"
        title="New arrivals"
        products={newest?.items ?? []}
        viewAllHref="/shop"
      />
      <NewsletterSection />
    </>
  )
}

/**
 * Structured data (JSON-LD) that tells Google who the store is — can show the
 * name and logo in search results (CLAUDE.md §13).
 * JSON.stringify output is placed inside a <script>, so "<" is escaped to stop
 * any text from closing the script tag early (an XSS precaution).
 */
function OrganizationJsonLd() {
  const json = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Nowoll',
    slogan: 'always new',
    url: publicEnv.siteUrl,
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, '\\u003c') }}
    />
  )
}
