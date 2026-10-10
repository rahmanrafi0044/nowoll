import type { CategoryNode } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'
import { AccountButton } from './account-button'
import { CartButton } from './cart-button'
import { MobileMenu } from './mobile-menu'

// Top-level categories as the main navigation. On phones they move into
// the ☰ menu (MobileMenu); on tablets/desktop they're shown inline.
export function SiteHeader({
  categories,
  storeName,
  logoUrl,
}: {
  categories: CategoryNode[]
  /** From Admin → Settings (step 38). */
  storeName: string
  /** The logo (Admin → Settings → Look); empty = the name as text. */
  logoUrl?: string
}) {
  return (
    <header className="relative border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          <MobileMenu categories={categories} />
          <Link href="/" className="text-xl font-semibold tracking-tight">
            {logoUrl ? (
              // The name stays as the picture's text, for screen readers and if it can't load.
              <Image
                src={logoUrl}
                alt={storeName}
                width={160}
                height={40}
                priority
                className="h-10 w-auto max-w-[180px] object-contain"
              />
            ) : (
              storeName
            )}
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
        <div className="flex items-center gap-4">
          <AccountButton />
          <CartButton />
        </div>
      </div>
    </header>
  )
}
