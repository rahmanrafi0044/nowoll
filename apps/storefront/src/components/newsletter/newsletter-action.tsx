'use client'

import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { useState } from 'react'
import { confirmSubscription, unsubscribe } from '@/lib/newsletter-api'

const TEXT = {
  confirm: {
    intro: 'One click and you’ll get new arrivals and offers — at most a few emails a month.',
    button: 'Confirm subscription',
    done: 'You’re subscribed — thank you! Every email has an unsubscribe link at the bottom.',
  },
  unsubscribe: {
    intro: 'You’ll stop getting our newsletter. Order and account emails still arrive as usual.',
    button: 'Unsubscribe',
    done: 'You’re unsubscribed. Changed your mind? You can sign up again any time at the bottom of our pages.',
  },
}

/**
 * The newsletter email links here. The ACTION needs a click: some email
 * security scanners open every link in an email, and a link that confirmed or
 * unsubscribed by itself would act without the person knowing (step 28).
 */
export function NewsletterAction({
  kind,
  token,
}: {
  kind: 'confirm' | 'unsubscribe'
  token: string | null
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const t = TEXT[kind]

  if (!token)
    return (
      <p role="alert">
        This link isn&apos;t complete — please use the button in the email we sent you.
      </p>
    )
  if (state === 'done')
    return (
      <div role="status" className="flex flex-col gap-3">
        <p>{t.done}</p>
        <Link href="/shop" className="font-medium underline underline-offset-4">
          Continue shopping
        </Link>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">{t.intro}</p>
      {problem && (
        <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          {problem}
        </p>
      )}
      <Button
        className="self-start"
        disabled={state === 'sending'}
        onClick={async () => {
          setState('sending')
          setProblem(null)
          const r = kind === 'confirm' ? await confirmSubscription(token) : await unsubscribe(token)
          if (r.ok) return setState('done')
          setState('idle')
          setProblem(
            r.status === 429
              ? 'Too many tries — please wait a minute.'
              : r.message || 'Something went wrong. Please try again.',
          )
        }}
      >
        {state === 'sending' ? 'One moment…' : t.button}
      </Button>
    </div>
  )
}
