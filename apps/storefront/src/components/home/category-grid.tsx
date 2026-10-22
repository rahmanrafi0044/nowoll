import type { CategoryNode } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'

const MAX_TILES = 8

// "Shop by category": one tile per top-level category, in the admin's sort order.
export function CategoryGrid({
  categories,
  id = 'shop-by-category',
  title = 'Shop by category',
}: {
  categories: CategoryNode[]
  /** Heading id + title — set from the admin's homepage builder (step 36). */
  id?: string
  title?: string
}) {
  if (categories.length === 0) return null

  return (
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 py-12">
      <h2 id={id} className="text-3xl md:text-4xl">
        {title}
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.slice(0, MAX_TILES).map((category, i) => (
          <li
            key={category.id}
            data-reveal
            style={{ '--reveal-order': i % 4 } as React.CSSProperties}
          >
            <Link
              href={`/shop/${category.slug}`}
              className="group relative flex aspect-[3/4] items-end overflow-hidden bg-surface-muted p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {category.imageUrl && (
                <>
                  <Image
                    src={category.imageUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"
                    aria-hidden="true"
                  />
                </>
              )}
              <span
                className={`relative font-display text-2xl ${category.imageUrl ? 'text-white' : 'text-foreground'}`}
              >
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
