'use client'

import type { ProductImageView } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * A product card's photos (design refresh 38f):
 *  - phone (touch): swipe through up to 4 photos, dots show where you are;
 *  - computer (a mouse): hovering the card slides to the second photo, and
 *    ‹ › arrows step through all of them (dots show where you are).
 * One sideways-scrolling strip serves both: a swipe scrolls it, an arrow or a
 * hover scrolls it for you. Every photo links to the product.
 *
 * Screen readers and keyboards: they hear the first photo only and skip the
 * arrows (a mouse convenience, like the hover) — the card's name link takes
 * them to the product page with the full gallery. 24 cards × 2 arrows would
 * otherwise mean 48 extra Tab stops.
 */
export function CardGallery({
  images,
  href,
  priority,
}: {
  images: ProductImageView[]
  href: string
  priority: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = images.length

  const onScroll = () => {
    const el = trackRef.current
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }
  const show = (i: number) => {
    const el = trackRef.current
    if (!el) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: i * el.clientWidth, behavior: calm ? 'auto' : 'smooth' })
  }

  // Computer: hovering the CARD peeks at the second photo, leaving it goes back.
  // (The whole card: the name link is stretched over the photo, so the photo
  // itself never sees the mouse.) Listeners on the card, set up once.
  useEffect(() => {
    const el = trackRef.current
    const card = el?.closest('article')
    if (!el || !card || count < 2) return
    if (!window.matchMedia?.('(hover: hover)').matches) return
    const enter = () => el.scrollLeft < el.clientWidth / 2 && show(1)
    const leave = () => show(0)
    card.addEventListener('mouseenter', enter)
    card.addEventListener('mouseleave', leave)
    return () => {
      card.removeEventListener('mouseenter', enter)
      card.removeEventListener('mouseleave', leave)
    }
  }, [count])

  return (
    <div className="relative aspect-[3/4] overflow-hidden bg-surface-muted">
      <div
        ref={trackRef}
        onScroll={count > 1 ? onScroll : undefined}
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <Link
            key={img.id}
            href={href}
            tabIndex={-1}
            aria-hidden={i > 0 || undefined}
            className="relative block h-full w-full shrink-0 snap-start"
          >
            <Image
              src={img.url}
              alt={i === 0 ? img.altText : ''}
              fill
              priority={priority && i === 0}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover"
            />
          </Link>
        ))}
      </div>
      {count > 1 && (
        <>
          {/* relative z-10: above the card's stretched name link. Only on devices with a mouse. */}
          <CardArrow side="left" hidden={index === 0} onClick={() => show(index - 1)} />
          <CardArrow side="right" hidden={index >= count - 1} onClick={() => show(index + 1)} />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center gap-1.5"
          >
            {images.map((img, i) => (
              <span
                key={img.id}
                className={`h-1 rounded-full bg-white/90 shadow transition-all ${i === index ? 'w-4' : 'w-1.5 opacity-60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CardArrow({
  side,
  hidden,
  onClick,
}: {
  side: 'left' | 'right'
  hidden: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={(e) => {
        e.preventDefault() // never also open the product
        onClick()
      }}
      className={`absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-surface-raised [@media(hover:hover)]:flex ${
        side === 'left' ? 'left-2' : 'right-2'
      } ${hidden ? 'pointer-events-none !opacity-0' : ''}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d={side === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  )
}
