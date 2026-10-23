'use client'

import type { Paginated, ProductCardView } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { call } from '@/lib/cart-api'
import { formatBdt } from '@/lib/format'
import { CloseIcon, SearchIcon } from '../icons'

/** Results appear after this pause in typing — not on every key. */
const TYPING_PAUSE_MS = 250
const RESULTS = 6

/**
 * Search (design refresh 38f): the 🔍 opens a panel; typing shows the first
 * matching products at once (photo, name, price), Enter shows them all on
 * /shop?q=… The suggested words come from Admin → Settings → Search suggestions.
 *
 * It's a real <dialog>: focus stays inside while open, Escape closes it, and
 * the results are announced as they change (aria-live).
 */
export function SearchDrawer({ suggestions }: { suggestions: string[] }) {
  const ref = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ProductCardView[] | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const words = q.trim()
    if (words.length < 2) return // `shown` below hides old results meanwhile
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const r = await call<Paginated<ProductCardView>>(
        'GET',
        `/products?q=${encodeURIComponent(words)}&pageSize=${RESULTS}`,
      )
      if (cancelled) return
      setResults(r.ok ? r.data.items : [])
      setTotal(r.ok ? r.data.total : 0)
    }, TYPING_PAUSE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [q])

  // Fewer than 2 letters: show the suggestions, not stale results.
  const shown = q.trim().length >= 2 ? results : null

  const open = () => {
    ref.current?.showModal()
    inputRef.current?.focus()
  }
  const close = () => ref.current?.close()
  const allResults = (words: string) => `/shop?q=${encodeURIComponent(words)}`

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="inline-flex size-11 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-brand"
      >
        <span className="sr-only">Search</span>
        <SearchIcon />
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={(e) => e.target === ref.current && close()}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-md bg-surface-raised p-0 text-foreground backdrop:bg-black/30 open:motion-safe:animate-[drawer-in-right_0.3s_var(--ease-out-soft)]"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id={titleId} className="text-xl">
              Search
            </h2>
            <button
              type="button"
              onClick={close}
              className="inline-flex size-10 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span className="sr-only">Close search</span>
              <CloseIcon />
            </button>
          </div>
          {/* A plain GET form: Enter shows every result on /shop?q=…, even
              before this page's JavaScript has loaded. */}
          <form role="search" action="/shop" method="get" className="px-5 pt-5">
            <label className="flex items-center gap-3 border-b border-foreground pb-2">
              <SearchIcon className="size-5 text-muted-foreground" />
              <span className="sr-only">Search products</span>
              <input
                ref={inputRef}
                type="search"
                name="q"
                required
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search kurtis, three-pieces, fabrics…"
                maxLength={100}
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
              />
            </label>
          </form>
          {suggestions.length > 0 && !shown && (
            <div className="px-5 pt-5">
              <p className="text-xs text-muted-foreground">Popular</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <li key={s}>
                    <Link
                      href={allResults(s)}
                      onClick={close}
                      className="inline-block rounded-full border border-border px-3 py-1.5 text-sm hover:border-foreground focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      {s}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div aria-live="polite" className="flex-1 overflow-y-auto px-5 py-5">
            {shown && shown.length === 0 && (
              <p className="text-muted-foreground">Nothing found for “{q.trim()}”.</p>
            )}
            {shown && shown.length > 0 && (
              <>
                <ul className="flex flex-col gap-4">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/products/${p.slug}`}
                        onClick={close}
                        className="flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        <span className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden bg-surface-muted">
                          {p.image && (
                            <Image
                              src={p.image.url}
                              alt=""
                              fill
                              sizes="72px"
                              className="object-cover"
                            />
                          )}
                        </span>
                        <span className="flex flex-col gap-1">
                          <span className="font-display text-lg leading-tight">{p.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {p.fromPrice
                              ? `From ${formatBdt(p.fromPrice)}`
                              : formatBdt(p.basePrice)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {total > shown.length && (
                  <Link
                    href={allResults(q.trim())}
                    onClick={close}
                    className="mt-6 block w-full border border-foreground py-3 text-center text-sm font-medium tracking-wide hover:bg-foreground hover:text-surface"
                  >
                    See all {total} results
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}
