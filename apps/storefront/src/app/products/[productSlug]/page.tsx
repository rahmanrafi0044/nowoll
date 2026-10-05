import type { CategoryDetail, Paginated, ProductCardView, ProductDetailView } from '@nowoll/types'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ProductView } from '@/components/product/product-view'
import { apiGet } from '@/lib/api'
import { absoluteUrl, breadcrumbJsonLd, JsonLd } from '@/lib/json-ld'

type Props = { params: Promise<{ productSlug: string }> }

// SSG + ISR (spec + CLAUDE.md §13): pages are built ahead of time and rebuilt
// in the background at most every 60 seconds.
export const revalidate = 60

/**
 * Which product pages to build during `next build`. Products added later (or
 * all of them, if the API is unreachable during the build) are built on their
 * first visit instead — nothing breaks either way.
 */
export async function generateStaticParams(): Promise<{ productSlug: string }[]> {
  const slugs: string[] = []
  for (let page = 1; page <= 20; page++) {
    const result = await apiGet<Paginated<ProductCardView>>(`/products?pageSize=60&page=${page}`)
    if (!result) break
    slugs.push(...result.items.map((p) => p.slug))
    if (page >= result.totalPages) break
  }
  return slugs.map((productSlug) => ({ productSlug }))
}

const getProduct = cache((slug: string) =>
  apiGet<ProductDetailView>(`/products/${encodeURIComponent(slug)}`),
)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).productSlug)
  if (!product) return { title: 'Product not found' }
  const image = product.images[0]
  return {
    title: product.seoTitle ?? product.name,
    description:
      product.seoDescription ??
      product.shortDescription ??
      product.description?.slice(0, 160) ??
      undefined,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'website',
      title: product.name,
      ...(image && { images: [{ url: absoluteUrl(image.url), alt: image.altText }] }),
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct((await params).productSlug)
  if (!product) notFound() // draft, archived, hidden category or unknown → 404

  // The size guide belongs to the product's category (the last breadcrumb step).
  const categorySlug = product.breadcrumb.at(-1)?.slug
  const category = categorySlug ? await apiGet<CategoryDetail>(`/categories/${categorySlug}`) : null
  const sizeGuide = category?.sizeGuide ?? null

  return (
    // Extra bottom padding on phones so the sticky "Add to bag" bar never covers content.
    <div className="mx-auto max-w-7xl px-4 py-8 pb-28 md:pb-12">
      <JsonLd data={productJsonLd(product)} />
      <JsonLd
        data={breadcrumbJsonLd(product.breadcrumb, {
          name: product.name,
          path: `/products/${product.slug}`,
        })}
      />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              Home
            </Link>
          </li>
          {product.breadcrumb.map((b) => (
            <li key={b.id} className="flex items-center gap-1">
              <span aria-hidden="true">/</span>
              <Link href={`/shop/${b.slug}`} className="hover:underline">
                {b.name}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <ProductView
        product={product}
        sticky
        sizeGuideHref={sizeGuide ? '#size-guide' : undefined}
        header={
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
            {product.shortDescription && (
              <p className="mt-2 text-muted-foreground">{product.shortDescription}</p>
            )}
          </div>
        }
      >
        {product.description && (
          <section aria-labelledby="details" className="border-t border-border pt-6">
            <h2 id="details" className="text-lg font-semibold">
              Details
            </h2>
            {/* Plain text with line breaks kept — never rendered as HTML */}
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{product.description}</p>
          </section>
        )}
        {sizeGuide && (
          <section
            id="size-guide"
            aria-labelledby="size-guide-title"
            className="scroll-mt-24 border-t border-border pt-6"
          >
            <h2 id="size-guide-title" className="text-lg font-semibold">
              Size guide
            </h2>
            <p className="mt-2 whitespace-pre-line font-mono text-sm text-muted-foreground">
              {sizeGuide}
            </p>
          </section>
        )}
      </ProductView>
    </div>
  )
}

/** Product structured data: lets Google show price and availability in search results. */
function productJsonLd(product: ProductDetailView) {
  const prices = product.variants.map((v) => Number(v.price))
  const inStock = product.variants.some((v) => v.inStock)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    image: product.images.map((i) => absoluteUrl(i.url)),
    brand: { '@type': 'Brand', name: 'Nowoll' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'BDT',
      lowPrice: prices.length ? Math.min(...prices) : Number(product.basePrice),
      highPrice: prices.length ? Math.max(...prices) : Number(product.basePrice),
      offerCount: product.variants.length,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: absoluteUrl(`/products/${product.slug}`),
    },
  }
}
