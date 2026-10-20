'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fetchWishlist } from '@/lib/account-api'
import { useSessionStore } from '@/stores/session-store'
import { HeartIcon } from '../icons'

/**
 * Header ♡ (38f): the saved items. Signed in → the wishlist, with how many;
 * guests → sign in first (the wishlist belongs to an account, step 23).
 */
export function WishlistLink() {
  const status = useSessionStore((s) => s.status)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (status !== 'signed-in') return
    let cancelled = false
    void fetchWishlist().then((r) => !cancelled && setCount(r.ok ? r.data.length : 0))
    return () => {
      cancelled = true
    }
  }, [status])

  const signedIn = status === 'signed-in'
  return (
    <Link
      href={signedIn ? '/account/wishlist' : '/login?next=/account/wishlist'}
      className="relative inline-flex size-11 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="sr-only">
        Wishlist{signedIn ? `, ${count} ${count === 1 ? 'item' : 'items'}` : ''}
      </span>
      <HeartIcon />
      {signedIn && count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1 flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-surface"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
