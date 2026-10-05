'use client'

import type { ProductImageView } from '@nowoll/types'
import Image from 'next/image'
import { useState } from 'react'
import { Modal } from '@/components/modal'

// Main photo + thumbnails. Clicking the main photo opens it large ("zoom").
export function ProductGallery({
  images,
  productName,
}: {
  images: ProductImageView[]
  productName: string
}) {
  const [index, setIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const current = images[Math.min(index, images.length - 1)]

  if (!current) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-control bg-surface-muted text-muted-foreground">
        No photo
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={`Enlarge photo: ${current.altText}`}
        className="relative aspect-[4/5] cursor-zoom-in overflow-hidden rounded-control bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Image
          src={current.url}
          alt={current.altText}
          fill
          priority // the main product photo is the page's largest element (LCP)
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
      </button>

      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto" aria-label="Product photos">
          {images.map((image, i) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                className={`relative block size-16 overflow-hidden rounded-control border-2 focus-visible:outline-2 focus-visible:outline-brand ${i === index ? 'border-brand' : 'border-transparent'}`}
              >
                <span className="sr-only">Show photo {i + 1}</span>
                <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={zoomed} onClose={() => setZoomed(false)} title={productName} wide>
        <div className="relative aspect-[4/5] w-full">
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
