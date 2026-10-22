'use client'

import type { AnnouncementBar as AnnouncementBarData } from '@nowoll/validation'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/** Seconds each message stays before the next. */
const TURN_MS = 5000

// The strip above the header, e.g. "Free delivery in Dhaka over ৳2,000".
// From Admin → Content → Announcement. 38f: with more than one message they
// take turns (a soft fade). Hovering or focusing it pauses; "reduce motion"
// shows only the first message. Screen readers get the current one, no spam.
export function AnnouncementBar({
  data,
}: {
  data: Omit<AnnouncementBarData, 'more'> & Partial<Pick<AnnouncementBarData, 'more'>>
}) {
  const messages = [{ text: data.text, href: data.href }, ...(data.more ?? [])]
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (messages.length < 2 || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setI((n) => (n + 1) % messages.length), TURN_MS)
    return () => window.clearInterval(t)
  }, [messages.length, paused])

  const m = messages[i] ?? messages[0]!
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="bg-foreground px-4 py-2 text-center text-xs text-surface"
    >
      <p key={i} className="motion-safe:animate-[fade-in_0.6s_ease-out]">
        {m.href ? (
          <Link href={m.href} className="underline-offset-4 hover:underline">
            {m.text}
          </Link>
        ) : (
          m.text
        )}
      </p>
    </div>
  )
}
