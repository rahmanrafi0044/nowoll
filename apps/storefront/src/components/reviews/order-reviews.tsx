'use client'

import type { MyReviewView, OrderLineView } from '@nowoll/types'
import { useEffect, useState } from 'react'
import { fetchMyReviews } from '@/lib/review-api'
import { ReviewForm } from './review-form'
import { Stars } from './stars'

const STATUS_TEXT: Record<MyReviewView['status'], string> = {
  PENDING: 'Waiting for approval',
  APPROVED: 'Published',
  REJECTED: 'Not published',
}

/**
 * On a DELIVERED order's page: review each product bought (step 24).
 * One review per product — editing sends it for approval again.
 */
export function OrderReviews({ items }: { items: OrderLineView[] }) {
  // One entry per product (sizes/colours of the same product share a review);
  // deleted products (productId null) can't be reviewed.
  const products = [
    ...new Map(
      items.filter((i) => i.productId).map((i) => [i.productId!, i.productName]),
    ).entries(),
  ]
  const [mine, setMine] = useState<Map<string, MyReviewView> | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchMyReviews().then((r) => {
      if (!cancelled) setMine(new Map((r.ok ? r.data : []).map((x) => [x.productId, x])))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (products.length === 0 || !mine) return null
  return (
    <section aria-labelledby="order-reviews" className="flex flex-col gap-4">
      <h2 id="order-reviews" className="text-xl font-semibold">
        Review your items
      </h2>
      <ul className="flex flex-col gap-4">
        {products.map(([productId, name]) => {
          const review = mine.get(productId) ?? null
          return (
            <li key={productId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{name}</span>
                {review && (
                  <>
                    <Stars value={review.rating} />
                    <span className="text-muted-foreground">{STATUS_TEXT[review.status]}</span>
                  </>
                )}
                {open !== productId && (
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => setOpen(productId)}
                  >
                    {review ? 'Edit your review' : 'Write a review'}
                  </button>
                )}
              </div>
              {review?.status === 'REJECTED' && review.rejectionReason && (
                <p className="text-sm text-muted-foreground">
                  Why: {review.rejectionReason} — edit your review to send it again.
                </p>
              )}
              {open === productId && (
                <ReviewForm
                  productId={productId}
                  productName={name}
                  existing={review}
                  onCancel={() => setOpen(null)}
                  onSaved={(saved) => {
                    setMine(new Map(mine).set(productId, saved))
                    setOpen(null)
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
