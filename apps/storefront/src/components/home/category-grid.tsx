import type { CategoryNode } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'

const MAX_TILES = 8

// "Shop by category": one tile per top-level category, in the admin's sort order.
export function CategoryGrid({ categories }: { categories: CategoryNode[] }) {
  if (categories.length === 0) return null

  return (
    <section aria-labelledby="shop-by-category" className="mx-auto max-w-7xl px-4 py-12">
      <h2 id="shop-by-category" className="text-2xl font-semibold tracking-tight">
        Shop by category
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.slice(0, MAX_TILES).map((category) => (
          <li key={category.id}>
            <Link
              href={`/shop/${category.slug}`}
              className="group relative flex aspect-[4/3] items-end overflow-hidden rounded-control bg-surface-muted p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {category.imageUrl && (
                <>
                  <Image
                    src={category.imageUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
                    aria-hidden="true"
                  />
                </>
              )}
              <span
                className={`relative text-lg font-semibold ${category.imageUrl ? 'text-white' : 'text-foreground'}`}
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
