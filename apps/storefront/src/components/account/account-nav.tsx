'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export const ACCOUNT_LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/wishlist', label: 'Wishlist' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/profile', label: 'Profile' },
]

/** Account sections — a row of tabs on phones, a sidebar on larger screens. */
export function AccountNav() {
  const path = usePathname()
  const active = (href: string) => (href === '/account' ? path === href : path.startsWith(href))
  return (
    <nav aria-label="Your account">
      <ul className="flex gap-2 overflow-x-auto md:flex-col md:gap-1">
        {ACCOUNT_LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active(l.href) ? 'page' : undefined}
              className="block whitespace-nowrap rounded-control px-3 py-2 text-sm hover:bg-surface-muted aria-[current=page]:bg-surface-muted aria-[current=page]:font-semibold"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
