import type {
  CategoryDetail,
  Paginated,
  ProductCardView,
  ProductDetailView,
  ProductReviewsView,
  ShippingRateView,
} from '@nowoll/types'
import { Markdown } from '@nowoll/ui'
import { productInfoLines, productInfoSchema } from '@nowoll/validation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ProductCard } from '@/components/product-card'
import { Fold } from '@/components/product/fold'
import { ProductInfoBox } from '@/components/product/product-info-box'
import { ProductView } from '@/components/product/product-view'
import { ProductReviews } from '@/components/reviews/product-reviews'
import { apiGet } from '@/lib/api'
import { absoluteUrl, breadcrumbJsonLd, JsonLd } from '@/lib/json-ld'
import { productJsonLd } from '@/lib/product-json-ld'
import { TrackViewItem } from '@/components/tracking/track-view-item'
import { getSettings } from '@/lib/settings'

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
  // Approved reviews (step 24) — refreshed with the page (ISR, 60 s). If the
  // reviews can't be loaded, the product page still works without them.
  const reviews = await apiGet<ProductReviewsView>(`/reviews/product/${product.id}`)
  // The "Delivery and returns" box (Admin → Content → Product info, step 38d):
  // off until saved; its automatic lines follow the live fees and rules.
  const [settings, infoBlock, zones] = await Promise.all([
    getSettings(),
    apiGet<{ data: unknown }>('/content-blocks/product_info'),
    apiGet<ShippingRateView[]>('/shipping/rates'),
  ])
  const info = infoBlock ? productInfoSchema.safeParse(infoBlock.data) : null
  // 38f "You may also like": others from the same category (cached 60 s like the rest).
  const related = categorySlug
    ? ((
        await apiGet<Paginated<ProductCardView>>(`/products?category=${categorySlug}&pageSize=5`)
      )?.items
        .filter((p) => p.id !== product.id)
        .slice(0, 4) ?? [])
    : []

  return (
    // Extra bottom padding on phones so the sticky "Add to bag" bar never covers content.
    <div className="mx-auto max-w-7xl px-4 py-8 pb-28 md:pb-12">
      <JsonLd data={productJsonLd(product, reviews, settings.store_name)} />
      <TrackViewItem productId={product.id} name={product.name} price={Number(product.basePrice)} />
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
        whatsapp={settings.store_whatsapp || undefined}
        pageUrl={absoluteUrl(`/products/${product.slug}`)}
        header={
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl leading-tight md:text-5xl">{product.name}</h1>
            {product.shortDescription && (
              <p className="text-muted-foreground">{product.shortDescription}</p>
            )}
            {(product.badges?.readyToShip || product.fabric) && (
              <p className="text-sm text-accent">
                {[
                  product.fabric,
                  product.badges?.readyToShip && product.inStock ? 'Ready to ship' : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>
        }
      >
        {info?.success && (
          <ProductInfoBox
            info={info.data}
            lines={productInfoLines(info.data, zones ?? [], settings)}
          />
        )}
        {/* 38f: the details as folds — the first one open. */}
        <div className="border-t border-border">
          {product.description && (
            <Fold title="Details" open>
              {/* Plain text with line breaks kept — never rendered as HTML */}
              <p className="whitespace-pre-line">{product.description}</p>
              {product.fitNote && <p className="mt-3">{product.fitNote}</p>}
            </Fold>
          )}
          {(product.fabric || product.care) && (
            <Fold title="Fabric and care">
              {product.fabric && <p>Fabric: {product.fabric}</p>}
              {product.care && <p className="mt-2 whitespace-pre-line">{product.care}</p>}
            </Fold>
          )}
          {sizeGuide && (
            <Fold id="size-guide" title="Size guide">
              {/* Markdown since step 36b — a real table (Size | Chest | Length), written in
                  Admin → Categories with a live preview. Same safe renderer as the pages. */}
              <Markdown className="text-sm">{sizeGuide}</Markdown>
            </Fold>
          )}
        </div>
        <ProductReviews productId={product.id} initial={reviews} />
      </ProductView>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-20" data-reveal>
          <h2 id="related-title" className="text-3xl">
            You may also like
          </h2>
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {related.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
