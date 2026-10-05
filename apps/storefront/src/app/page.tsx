import type { CategoryNode, Paginated, ProductCardView } from '@nowoll/types'
import type { HomepageHero } from '@nowoll/validation'
import type { Metadata } from 'next'
import { CategoryGrid } from '@/components/home/category-grid'
import { Hero } from '@/components/home/hero'
import { NewsletterSection } from '@/components/home/newsletter-section'
import { ProductSection } from '@/components/home/product-section'
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
