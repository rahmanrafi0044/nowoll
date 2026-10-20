'use client'

import type { ProductImageView } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'

/**
 * A product card's photos (design refresh 38f):
 *  - computer (a mouse): hovering the card slides to the second photo;
 *  - phone (touch): swipe through up to 4 photos, dots show where you are.
 * Every photo links to the product. Screen readers hear the first photo only —
 * the card's name link is the one they use (no repeated links).
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
  const onScroll = () => {
    const el = trackRef.current
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="relative aspect-[3/4] overflow-hidden bg-surface-muted">
      <div
        ref={trackRef}
        onScroll={images.length > 1 ? onScroll : undefined}
        className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [@media(hover:hover)]:overflow-hidden"
      >
        {images.map((img, i) => (
          <Link
            key={img.id}
            href={href}
            tabIndex={-1}
            aria-hidden={i > 0 || undefined}
            className={`relative block h-full w-full shrink-0 snap-start transition-transform duration-700 ease-(--ease-out-soft) motion-reduce:transition-none ${
              images.length > 1 ? '[@media(hover:hover)]:group-hover:-translate-x-full' : ''
            } ${i > 1 ? '[@media(hover:hover)]:hidden' : ''}`}
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
      {images.length > 1 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5 [@media(hover:hover)]:hidden"
        >
          {images.map((img, i) => (
            <span
              key={img.id}
              className={`h-1 rounded-full bg-white/90 shadow transition-all ${i === index ? 'w-4' : 'w-1.5 opacity-60'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
