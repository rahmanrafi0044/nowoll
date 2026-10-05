'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { type CheckoutStep, STEPS, useCheckoutStore } from '@/stores/checkout-store'

// One step of the checkout "accordion": open (the form), done (a short
// summary + Edit), or not reached yet (just the title).
export function StepSection({
  step,
  title,
  summary,
  children,
}: {
  step: CheckoutStep
  title: string
  summary?: ReactNode
  children: ReactNode
}) {
  const current = useCheckoutStore((s) => s.step)
  const done = useCheckoutStore((s) => s.done.includes(step))
  const goTo = useCheckoutStore((s) => s.goTo)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const open = current === step
  const number = STEPS.indexOf(step) + 1

  // When a step opens, move keyboard/screen-reader focus to its heading,
  // so the customer doesn't have to hunt for where they are.
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) headingRef.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <section aria-labelledby={`step-${step}`} className="border-b border-border py-5">
      <div className="flex items-center justify-between gap-4">
        <h2
          id={`step-${step}`}
          ref={headingRef}
          tabIndex={-1}
          className={`text-lg font-semibold outline-none ${open || done ? '' : 'text-muted-foreground'}`}
        >
          <span className="mr-2 text-muted-foreground">{number}.</span>
          {title}
          {done && !open && <span className="sr-only"> (completed)</span>}
        </h2>
        {done && !open && (
          <button
            type="button"
            onClick={() => goTo(step)}
            className="text-sm underline underline-offset-4"
            aria-label={`Edit ${title.toLowerCase()}`}
          >
            Edit
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-4">{children}</div>
      ) : (
        done && summary && <div className="mt-2 text-sm text-muted-foreground">{summary}</div>
      )}
    </section>
  )
}
