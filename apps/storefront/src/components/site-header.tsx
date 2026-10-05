import type { CategoryNode } from '@nowoll/types'
import Link from 'next/link'
import { MobileMenu } from './mobile-menu'

// Top-level categories as the main navigation. On phones they move into
// the ☰ menu (MobileMenu); on tablets/desktop they're shown inline.
export function SiteHeader({ categories }: { categories: CategoryNode[] }) {
  return (
    <header className="relative border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          <MobileMenu categories={categories} />
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Nowoll
          </Link>
        </div>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-6 text-sm font-medium">
            <li>
              <Link href="/shop" className="hover:underline underline-offset-4">
                Shop all
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/shop/${c.slug}`} className="hover:underline underline-offset-4">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {/* Cart and account buttons arrive with Phase 3 (cart) and Phase 4 (accounts). */}
        <div className="w-11" aria-hidden="true" />
      </div>
    </header>
  )
}
