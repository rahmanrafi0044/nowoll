import Image from 'next/image'
import Link from 'next/link'
import type { NavLink } from '@/lib/navigation'
import { AccountButton } from './account-button'
import { CartButton } from './cart-button'
import { MobileMenu } from './mobile-menu'
import { NavAnchor } from './nav-link'

// The main menu (Admin → Content → Menu, step 38b — or "Shop all" + the
// top-level categories when nothing is saved). On phones it moves into the
// ☰ menu (MobileMenu); on tablets/desktop it's shown inline.
export function SiteHeader({
  links,
  storeName,
  logoUrl,
}: {
  links: NavLink[]
  /** From Admin → Settings (step 38). */
  storeName: string
  /** The logo (Admin → Settings → Look); empty = the name as text. */
  logoUrl?: string
}) {
  return (
    <header className="relative border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          <MobileMenu links={links} />
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
            {links.map((l) => (
              <li key={l.key}>
                <NavAnchor link={l} className="hover:underline underline-offset-4" />
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
