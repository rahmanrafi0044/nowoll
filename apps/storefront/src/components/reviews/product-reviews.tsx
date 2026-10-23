'use client'

import type { ProductReviewsView, PublicReviewView } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { useState } from 'react'
import { fetchProductReviews } from '@/lib/review-api'
import { Stars } from './stars'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Dhaka',
})

/**
 * The product page's reviews. The first page comes from the server (built
 * with the page, refreshed every 60 s); "Show more" loads the rest here.
 */
export function ProductReviews({
  productId,
  initial,
}: {
  productId: string
  initial: ProductReviewsView | null
}) {
  const [reviews, setReviews] = useState<PublicReviewView[]>(initial?.items ?? [])
  const [page, setPage] = useState(initial?.page ?? 1)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  if (!initial) return null // reviews unavailable right now — the page still works
  const { summary } = initial

  async function more() {
    setLoading(true)
    setProblem(null)
    const r = await fetchProductReviews(productId, page + 1)
    setLoading(false)
    if (!r.ok) return setProblem('Could not load more reviews. Please try again.')
    setReviews([...reviews, ...r.data.items])
    setPage(r.data.page)
  }

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-24 pt-2">
      <h2 id="reviews-title" className="text-lg">
        Reviews{' '}
        {summary.count > 0 && (
          <span className="font-normal text-muted-foreground">({summary.count})</span>
        )}
      </h2>

      {summary.count === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No reviews yet. Bought this? You can review it from your orders once it&apos;s delivered.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <p className="flex items-center gap-2">
              <span className="font-display text-4xl">{summary.average}</span>
              <Stars value={summary.average ?? 0} className="text-lg" />
            </p>
            <ul aria-label="Ratings breakdown" className="flex flex-col gap-1 text-sm">
              {(['5', '4', '3', '2', '1'] as const).map((stars) => {
                const n = summary.breakdown[stars]
                return (
                  <li key={stars} className="flex items-center gap-2">
                    <span className="w-8">{stars}★</span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-32 overflow-hidden bg-surface-muted"
                    >
                      <span
                        className="block h-full bg-accent"
                        style={{ width: `${(n / summary.count) * 100}%` }}
                      />
                    </span>
                    <span className="text-muted-foreground">
                      {n}
                      <span className="sr-only"> {n === 1 ? 'review' : 'reviews'}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <ul className="mt-6 flex flex-col divide-y divide-border">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <Stars value={r.rating} />
                {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                {/* Plain text, never HTML */}
                <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.author} · Verified buyer · {dateFormat.format(new Date(r.createdAt))}
                </p>
              </li>
            ))}
          </ul>
          {problem && (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          )}
          {page < initial.totalPages && (
            <Button variant="secondary" onClick={more} disabled={loading}>
              {loading ? 'Loading…' : 'Show more reviews'}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
