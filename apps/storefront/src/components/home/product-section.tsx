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
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        <Link
          href={viewAllHref}
          aria-label={`View all ${title.toLowerCase()}`}
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          View all
        </Link>
      </div>
      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product, i) => (
          <li key={product.id}>
            {/* Only the first row is loaded eagerly; the rest load as you scroll */}
            <ProductCard product={product} priority={priority && i < 4} />
          </li>
        ))}
      </ul>
    </section>
  )
}
