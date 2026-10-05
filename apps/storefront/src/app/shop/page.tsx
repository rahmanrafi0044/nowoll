import type { Metadata } from 'next'
import { ListingPage } from '@/components/listing/listing-page'
import { canonicalFor, parseListingParams } from '@/lib/listing'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// Rendered per request (filters live in the URL), but the API data behind it
// is cached for 60 seconds — see lib/api.ts.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = parseListingParams(await searchParams)
  return {
    title: params.q ? `Search: ${params.q}` : 'Shop all',
    description:
      'Shop all Nowoll clothing — shirts, panjabi, kurti and more, delivered across Bangladesh.',
    alternates: { canonical: canonicalFor('/shop', params.page) },
    // Search result pages are endless and thin — keep them out of Google, but let it follow the links.
    ...(params.q && { robots: { index: false, follow: true } }),
  }
}

export default async function ShopPage({ searchParams }: Props) {
  const params = parseListingParams(await searchParams)
  return (
    <ListingPage
      basePath="/shop"
      title={params.q ? `Results for “${params.q}”` : 'Shop all'}
      params={params}
      search
    />
  )
}
