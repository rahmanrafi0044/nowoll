import type { CategoryDetail } from '@nowoll/types'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ListingPage } from '@/components/listing/listing-page'
import { apiGet } from '@/lib/api'
import { breadcrumbJsonLd, JsonLd } from '@/lib/json-ld'
import { canonicalFor, parseListingParams } from '@/lib/listing'
import { getSettings } from '@/lib/settings'

type Props = {
  params: Promise<{ categorySlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// cache(): generateMetadata and the page both need the category — this makes
// them share ONE request instead of making two.
const getCategory = cache((slug: string) =>
  apiGet<CategoryDetail>(`/categories/${encodeURIComponent(slug)}`),
)

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { categorySlug } = await params
  const category = await getCategory(categorySlug)
  if (!category) return { title: 'Category not found' }
  const listing = parseListingParams(await searchParams)
  return {
    title: category.seoTitle ?? category.name,
    description:
      category.seoDescription ??
      category.description ??
      `Shop ${category.name} at ${(await getSettings()).store_name}.`,
    // Every filtered/sorted version points Google at the plain category page (CLAUDE.md §13).
    alternates: { canonical: canonicalFor(`/shop/${category.slug}`, listing.page) },
    openGraph: category.imageUrl
      ? { images: [{ url: category.imageUrl, alt: category.imageAlt ?? category.name }] }
      : undefined,
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { categorySlug } = await params
  const category = await getCategory(categorySlug)
  if (!category) notFound() // hidden, archived or unknown → the 404 page

  const trail = [
    ...category.breadcrumb,
    { id: category.id, name: category.name, slug: category.slug },
  ]
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <ListingPage
        basePath={`/shop/${category.slug}`}
        title={category.name}
        description={category.description}
        breadcrumb={trail}
        subcategories={category.children}
        category={category.slug}
        editorial={category.editorial}
        params={parseListingParams(await searchParams)}
      />
    </>
  )
}
