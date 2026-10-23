'use client'

import type { ProductImageView } from '@nowoll/types'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { Modal } from '@/components/modal'

/** How far (px) a finger must slide sideways to count as a swipe. */
const SWIPE_PX = 40

/**
 * The product photos (design refresh 38f): the main photo with previous / next,
 * thumbnails in a column beside it on computers (a row under it on phones),
 * swipe on phones, and a tap or click opens it large ("zoom").
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: ProductImageView[]
  productName: string
}) {
  const [index, setIndexRaw] = useState(0)
  // The soft fade only once the shopper switches photos — never on the first
  // photo: a photo fading in from invisible counts as "not shown yet" for
  // Lighthouse's main-content timing (it cost the product page ~0.5 s, 38f).
  const [switched, setSwitched] = useState(false)
  const setIndex = (next: number | ((i: number) => number)) => {
    setSwitched(true)
    setIndexRaw(next)
  }
  const [zoomed, setZoomed] = useState(false)
  const touchX = useRef<number | null>(null)
  const count = images.length
  const current = images[Math.min(index, count - 1)]

  if (!current) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center bg-surface-muted text-muted-foreground">
        No photo
      </div>
    )
  }

  const go = (step: number) => setIndex((i) => (i + step + count) % count)

  return (
    <div className="flex flex-col gap-3 md:flex-row-reverse md:items-start md:gap-4">
      <div
        className="relative flex-1"
        onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const start = touchX.current
          const end = e.changedTouches[0]?.clientX
          touchX.current = null
          if (start === null || end === undefined || count < 2) return
          if (Math.abs(end - start) > SWIPE_PX) go(end < start ? 1 : -1)
        }}
      >
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={`Enlarge photo: ${current.altText}`}
          className="relative block aspect-[3/4] w-full cursor-zoom-in overflow-hidden bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Image
            key={current.id}
            src={current.url}
            alt={current.altText}
            fill
            // The main product photo is the page's largest element (LCP): load it
            // at once and first (Next.js 16: `priority` became these two).
            loading={index === 0 ? 'eager' : undefined}
            fetchPriority={index === 0 ? 'high' : undefined}
            sizes="(min-width: 768px) 45vw, 100vw"
            className={`object-cover ${switched ? 'motion-safe:animate-[fade-in_0.4s_ease-out]' : ''}`}
          />
        </button>
        {count > 1 && (
          <>
            <Arrow side="left" label="Previous photo" onClick={() => go(-1)} />
            <Arrow side="right" label="Next photo" onClick={() => go(1)} />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden"
            >
              {images.map((img, i) => (
                <span
                  key={img.id}
                  className={`h-1 rounded-full bg-white/90 shadow transition-all ${i === index ? 'w-5' : 'w-1.5 opacity-60'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {count > 1 && (
        <ul
          className="flex gap-2 overflow-x-auto md:max-h-[70vh] md:w-20 md:flex-col md:overflow-y-auto"
          aria-label="Product photos"
        >
          {images.map((image, i) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                className={`relative block aspect-[3/4] w-16 overflow-hidden border focus-visible:outline-2 focus-visible:outline-brand md:w-20 ${
                  i === index
                    ? 'border-foreground'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <span className="sr-only">Show photo {i + 1}</span>
                <Image src={image.url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={zoomed} onClose={() => setZoomed(false)} title={productName} wide>
        <div className="relative aspect-[3/4] w-full">
          <Image
            src={current.url}
            alt={current.altText}
            fill
            sizes="(min-width: 1024px) 896px, 100vw"
            className="object-contain"
          />
        </div>
      </Modal>
    </div>
  )
}

function Arrow({
  side,
  label,
  onClick,
}: {
  side: 'left' | 'right'
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised/85 text-foreground shadow-sm hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-brand md:inline-flex ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d={side === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  )
}
