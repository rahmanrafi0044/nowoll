import type { ProductCardView } from '@nowoll/types'
import Link from 'next/link'
import { ProductCard } from '@/components/product-card'

// A titled row of product cards ("Featured", "New arrivals"). Hidden when empty.
export function ProductSection({
  id,
  title,
  products,
  viewAllHref,
  priority = false,
}: {
  id: string
  title: string
  products: ProductCardView[]
  viewAllHref: string
  priority?: boolean
}) {
  if (products.length === 0) return null

  return (
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 py-12 md:py-16">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-3xl md:text-4xl">
          {title}
        </h2>
        <Link
          href={viewAllHref}
          aria-label={`View all ${title.toLowerCase()}`}
          className="shrink-0 border-b border-foreground pb-0.5 text-sm hover:border-accent hover:text-accent"
        >
          View all
        </Link>
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product, i) => (
          <li
            key={product.id}
            data-reveal
            style={{ '--reveal-order': i % 4 } as React.CSSProperties}
          >
            {/* Only the first row is loaded eagerly; the rest load as you scroll */}
            <ProductCard product={product} priority={priority && i < 4} />
          </li>
        ))}
      </ul>
    </section>
  )
}
