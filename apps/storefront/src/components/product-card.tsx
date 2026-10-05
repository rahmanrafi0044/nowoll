import type { ProductCardView } from '@nowoll/types'
import { Badge } from '@nowoll/ui'
import Image from 'next/image'
import Link from 'next/link'
import { discountPercent, formatBdt } from '@/lib/format'

const MAX_SWATCHES = 5

// One product in a grid (homepage sections now; listing pages in step 13).
// A Server Component: no JavaScript is sent to the browser for it.
export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardView
  priority?: boolean
}) {
  const discount = discountPercent(product.basePrice, product.compareAtPrice)
  const extraColors = product.colors.length - MAX_SWATCHES

  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden rounded-control bg-surface-muted">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.altText}
            fill
            // Tells the browser which image size to download for each screen width
            // (2 columns on phones, 3 on tablets, 4 on desktop).
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            priority={priority} // load the first row immediately (better LCP score)
            className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No photo
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {!product.inStock && <Badge>Sold out</Badge>}
          {product.inStock && discount !== null && <Badge variant="danger">-{discount}%</Badge>}
        </div>
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {/* The ::after stretches the link over the whole card, so the entire card is clickable
              while screen readers still hear a single, clearly named link. */}
          <Link
            href={`/products/${product.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </h3>
        <p className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold text-foreground">{formatBdt(product.basePrice)}</span>
          {discount !== null && (
            <s className="text-muted-foreground">
              <span className="sr-only">was </span>
              {formatBdt(product.compareAtPrice!)}
            </s>
          )}
        </p>
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
    </article>
  )
}
