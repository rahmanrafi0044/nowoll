'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { addToWishlist, fetchWishlist, removeFromWishlist } from '@/lib/account-api'
import { useSessionStore } from '@/stores/session-store'

// The wishlist keeps an exact size + colour (one variant), so the customer
// chooses the size first (step 23 decision #5). Guests are offered sign-in.
let savedIds: Promise<Set<string>> | null = null // one wishlist fetch per page load

export function WishlistButton({
  variantId,
  productSlug,
}: {
  variantId: string | null
  productSlug: string
}) {
  const status = useSessionStore((s) => s.status)
  const [saved, setSaved] = useState<Set<string> | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (status !== 'signed-in') return
    let cancelled = false
    savedIds ??= fetchWishlist().then((r) => new Set(r.ok ? r.data.map((i) => i.variantId) : []))
    void savedIds.then((ids) => !cancelled && setSaved(new Set(ids)))
    return () => {
      cancelled = true
    }
  }, [status])

  if (status === 'signed-out')
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/products/${productSlug}`)}`}
        className="self-start text-sm underline underline-offset-4"
      >
        ♡ Sign in to save items
      </Link>
    )
  if (status === 'unknown') return null

  const isSaved = !!variantId && !!saved?.has(variantId)
  async function toggle() {
    if (!variantId) return setHint('Choose a size first.')
    setHint(null)
    setBusy(true)
    const result = isSaved ? await removeFromWishlist(variantId) : await addToWishlist(variantId)
    setBusy(false)
    if (!result.ok) return setHint(result.message || 'Could not update your wishlist.')
    const next = new Set(saved ?? [])
    if (isSaved) next.delete(variantId)
    else next.add(variantId)
    setSaved(next)
    savedIds = Promise.resolve(next)
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={isSaved}
        className="self-start text-sm underline underline-offset-4"
      >
        {isSaved ? '♥ Saved — remove from wishlist' : '♡ Save for later'}
      </button>
      {hint && (
        <p role="status" className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}
