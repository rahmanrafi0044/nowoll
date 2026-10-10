import type { ProductDetailView, ProductReviewsView } from '@nowoll/types'
import { absoluteUrl } from '@/lib/json-ld'

/**
 * Product structured data: lets Google show price and availability in search
 * results — and the star rating, once there's at least one approved review
 * (Google ignores or flags an aggregateRating without real reviews).
 */
export function productJsonLd(
  product: ProductDetailView,
  reviews: ProductReviewsView | null,
  /** The brand Google shows: the store's name (Admin → Settings). */
  brand: string,
) {
  const prices = product.variants.map((v) => Number(v.price))
  const inStock = product.variants.some((v) => v.inStock)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    image: product.images.map((i) => absoluteUrl(i.url)),
    brand: { '@type': 'Brand', name: brand },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'BDT',
      lowPrice: prices.length ? Math.min(...prices) : Number(product.basePrice),
      highPrice: prices.length ? Math.max(...prices) : Number(product.basePrice),
      offerCount: product.variants.length,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: absoluteUrl(`/products/${product.slug}`),
    },
    ...(reviews &&
      reviews.summary.count > 0 && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: reviews.summary.average,
          reviewCount: reviews.summary.count,
          bestRating: 5,
          worstRating: 1,
        },
        review: reviews.items.map((r) => ({
          '@type': 'Review',
          reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
          author: { '@type': 'Person', name: r.author },
          datePublished: r.createdAt.slice(0, 10),
          ...(r.title && { name: r.title }),
          reviewBody: r.body,
        })),
      }),
  }
}
