'use client'

import type { MyReviewView } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useState } from 'react'
import { FormProblem, problemText } from '@/components/account/auth-card'
import { submitReview } from '@/lib/review-api'
import { useFocusFirstError } from '@/lib/use-focus-first-error'

const BODY_MIN = 10
const BODY_MAX = 2000

/** Write or edit a review. Saving (again) sends it for approval. */
export function ReviewForm({
  productId,
  productName,
  existing,
  onSaved,
  onCancel,
}: {
  productId: string
  productName: string
  existing: MyReviewView | null
  onSaved: (review: MyReviewView) => void
  onCancel: () => void
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [errors, setErrors] = useState<{ rating?: string; body?: string }>({})
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const { formRef, focusFirstError } = useFocusFirstError()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    const found = {
      ...(!rating && { rating: 'Choose 1 to 5 stars' }),
      ...(text.length < BODY_MIN && { body: `Please write at least ${BODY_MIN} characters` }),
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return focusFirstError()
    setSending(true)
    setProblem(null)
    const r = await submitReview({ productId, rating, title: title.trim() || null, body: text })
    setSending(false)
    if (!r.ok) return setProblem(problemText(r))
    onSaved(r.data)
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-control border border-border p-4"
    >
      <fieldset aria-describedby={errors.rating ? `rating-error-${productId}` : undefined}>
        <legend className="text-sm font-medium">Your rating for {productName}</legend>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name={`rating-${productId}`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`text-2xl peer-focus-visible:outline-2 peer-focus-visible:outline-brand ${n <= rating ? 'text-warning' : 'text-border-strong'}`}
              >
                ★
              </span>
            </label>
          ))}
        </div>
        {errors.rating && (
          <p id={`rating-error-${productId}`} className="mt-1 text-sm text-danger">
            {errors.rating}
          </p>
        )}
      </fieldset>
      <Input
        label="Title (optional)"
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {/* The label is ONLY "Your review"; the counter, hint and error are a
          linked description — so screen readers announce a clean name. */}
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor={`review-body-${productId}`} className="font-medium">
          Your review
        </label>
        <textarea
          id={`review-body-${productId}`}
          value={body}
          maxLength={BODY_MAX}
          rows={5}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={`review-body-hint-${productId}${errors.body ? ` review-body-error-${productId}` : ''}`}
          className="rounded-control border border-border-strong bg-surface p-3 text-base"
        />
        <span id={`review-body-hint-${productId}`} className="text-xs text-muted-foreground">
          {body.trim().length}/{BODY_MAX} · How was the fit, fabric and colour?
        </span>
        {errors.body && (
          <span id={`review-body-error-${productId}`} className="text-danger">
            {errors.body}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Reviews are checked before they appear. Only your first name and last initial are shown.
      </p>
      <FormProblem message={problem} />
      <div className="flex gap-3">
        <Button type="submit" disabled={sending}>
          {sending ? 'Sending…' : existing ? 'Send updated review' : 'Send review'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
