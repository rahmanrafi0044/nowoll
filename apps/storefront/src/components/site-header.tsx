import Image from 'next/image'
import Link from 'next/link'
import type { NavLink } from '@/lib/navigation'
import { AccountButton } from './account-button'
import { CartButton } from './cart-button'
import { DesktopNav } from './header/desktop-nav'
import { HeaderShell } from './header/header-shell'
import { SearchDrawer } from './header/search-drawer'
import { WishlistLink } from './header/wishlist-link'
import { MobileMenu } from './mobile-menu'

// The header (design refresh 38f): the logo centred, search on the left,
// account / wishlist / bag on the right, and the menu (Admin → Content → Menu,
// step 38b) on its own row below with drop-downs — on phones it moves into
// the ☰ panel. HeaderShell keeps it on screen, hiding while scrolling down.
export function SiteHeader({
  links,
  storeName,
  logoUrl,
  searchSuggestions = [],
}: {
  links: NavLink[]
  /** From Admin → Settings (step 38). */
  storeName: string
  /** The logo (Admin → Settings → Look); empty = the name as text. */
  logoUrl?: string
  /** Admin → Settings → Search suggestions. */
  searchSuggestions?: string[]
}) {
  return (
    <HeaderShell>
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-4 lg:h-20 lg:px-6">
        <div className="flex items-center">
          <MobileMenu links={links} />
          <SearchDrawer suggestions={searchSuggestions} />
        </div>
        <Link
          href="/"
          className="justify-self-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          {logoUrl ? (
            // The name stays as the picture's text, for screen readers and if it can't load.
            <Image
              src={logoUrl}
              alt={storeName}
              width={160}
              height={40}
              priority
              className="h-9 w-auto max-w-[120px] object-contain min-[380px]:max-w-[150px] lg:h-11 lg:max-w-[180px]"
            />
          ) : (
            // Smaller and tighter on the narrowest phones (320 px): four icons
            // + the name must fit without sideways scrolling (WCAG 1.4.10).
            <span className="font-display text-xl tracking-[0.18em] uppercase min-[380px]:text-2xl min-[380px]:tracking-[0.3em] lg:text-3xl">
              {storeName}
            </span>
          )}
        </Link>
        <div className="flex items-center justify-end">
          <AccountButton />
          <span className="hidden sm:contents">
            <WishlistLink />
          </span>
          <CartButton />
        </div>
      </div>
      <div className="hidden border-t border-border lg:block">
        <DesktopNav links={links} />
      </div>
    </HeaderShell>
  )
}
