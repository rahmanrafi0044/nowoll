import type { ProductCardView } from '@nowoll/types'
import Link from 'next/link'
import { CardGallery } from '@/components/product/card-gallery'
import { QuickView } from '@/components/product/quick-view'
import { discountPercent, formatBdt } from '@/lib/format'

const MAX_SWATCHES = 5

// One product in a grid — homepage sections, listing pages, blog posts.
// Design refresh (38f): a tall photo (hover → the second photo; phones swipe),
// up to two badges, the name in the display serif, fabric and colour, and
// "From ৳…" when sizes cost different amounts. Server Component — only the
// little photo gallery runs JavaScript in the browser.
export function ProductCard({
  product,
  priority = false,
  quickView = false,
}: {
  product: ProductCardView
  priority?: boolean
  /** Listing pages: show a "Quick view" button (size/color + add to bag in a pop-up). */
  quickView?: boolean
}) {
  const discount = discountPercent(product.basePrice, product.compareAtPrice)
  const extraColors = product.colors.length - MAX_SWATCHES
  const href = `/products/${product.slug}`
  const images = product.images?.length ? product.images : product.image ? [product.image] : []
  const onlyColor = product.colors.length === 1 ? product.colors[0]!.color : null

  return (
    <article className="group relative flex flex-col">
      <div className="relative">
        {images.length > 0 ? (
          <CardGallery images={images} href={href} priority={priority} />
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center bg-surface-muted text-sm text-muted-foreground">
            No photo
          </div>
        )}
        <CardBadges product={product} discount={discount} />
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-1">
        <h3 className="font-display text-lg leading-snug text-foreground">
          {/* The ::after stretches the link over the whole card, so the entire card is
              clickable while screen readers hear one clearly named link; its keyboard focus
              mark goes around the whole card (WCAG 2.4.7, step 52). On touch screens the
              stretched part lets swipes through to the photos (which are links too). */}
          <Link
            href={href}
            className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-brand [@media(hover:none)]:after:pointer-events-none"
          >
            {product.name}
          </Link>
        </h3>
        {(product.fabric || onlyColor) && (
          <p className="text-sm text-muted-foreground">
            {onlyColor && <>In {onlyColor}</>}
            {product.fabric && onlyColor && ', '}
            {product.fabric && <em className="text-accent">{product.fabric}</em>}
          </p>
        )}
        <p className="flex items-baseline gap-2 text-sm">
          <span className="text-foreground">
            {product.fromPrice
              ? `From ${formatBdt(product.fromPrice)}`
              : formatBdt(product.basePrice)}
          </span>
          {discount !== null && (
            <s className="text-muted-foreground">
              <span className="sr-only">was </span>
              {formatBdt(product.compareAtPrice!)}
            </s>
          )}
        </p>
        {product.badges?.readyToShip && product.inStock && (
          <p className="text-xs text-accent">Ready to ship</p>
        )}
        {product.colors.length > 1 && (
          <ul
            className="mt-1 flex items-center gap-1.5"
            aria-label={`${product.colors.length} colors`}
          >
            {product.colors.slice(0, MAX_SWATCHES).map((c) => (
              <li
                key={c.color}
                title={c.color}
                className="size-3.5 rounded-full border border-border-strong"
                style={{ backgroundColor: c.colorHex ?? 'transparent' }}
              >
                <span className="sr-only">{c.color}</span>
              </li>
            ))}
            {extraColors > 0 && <li className="text-xs text-muted-foreground">+{extraColors}</li>}
          </ul>
        )}
      </div>
      {quickView && (
        <div className="relative mt-3">
          <QuickView slug={product.slug} name={product.name} />
        </div>
      )}
    </article>
  )
}

/**
 * At most two badges, most important first: Sold out → the sale → New →
 * Restocked. A sold-out product shows only "Sold out" (no "-20%" teaser).
 */
function CardBadges({ product, discount }: { product: ProductCardView; discount: number | null }) {
  const badges: { label: string; tone: 'dark' | 'sale' | 'light' }[] = []
  if (!product.inStock) badges.push({ label: 'Sold out', tone: 'dark' })
  else {
    if (discount !== null) badges.push({ label: `-${discount}%`, tone: 'sale' })
    if (product.badges?.isNew) badges.push({ label: 'New', tone: 'light' })
    if (product.badges?.restocked) badges.push({ label: 'Restocked', tone: 'light' })
  }
  if (badges.length === 0) return null
  const tone = {
    dark: 'bg-foreground text-surface',
    sale: 'bg-danger text-white',
    light: 'bg-surface-raised text-foreground',
  }
  return (
    <ul className="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1">
      {badges.slice(0, 2).map((b) => (
        <li key={b.label} className={`px-2 py-0.5 text-xs ${tone[b.tone]}`}>
          {b.label}
        </li>
      ))}
    </ul>
  )
}
