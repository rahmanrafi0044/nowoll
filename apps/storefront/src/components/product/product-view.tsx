'use client'

import type { ProductDetailView } from '@nowoll/types'
import { type ReactNode, useState } from 'react'
import { imagesForColor, initialSelection } from '@/lib/variants'
import { ProductGallery } from './product-gallery'
import { ProductPurchase } from './product-purchase'

// Gallery + purchase panel share one piece of state: the selected color.
// Choosing "Blue" switches the photos to the blue ones.
// `header` and `children` are rendered on the server and passed in.
export function ProductView({
  product,
  header,
  children,
  sticky = false,
  sizeGuideHref,
  whatsapp,
  pageUrl,
}: {
  product: ProductDetailView
  header?: ReactNode
  children?: ReactNode
  sticky?: boolean
  sizeGuideHref?: string
  whatsapp?: string
  pageUrl?: string
}) {
  const initial = initialSelection(product.variants)
  const [color, setColor] = useState(initial.color)
  const images = imagesForColor(product.images, product.variants, color)

  return (
    // minmax(0, …): a column never grows wider than its share to fit something
    // wide inside (e.g. a size chart in cm) — that scrolls in its own box instead.
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-14">
      {/* key: start again at the first photo when the color changes */}
      <ProductGallery key={color ?? 'all'} images={images} productName={product.name} />
      <div className="flex flex-col gap-6">
        {header}
        <ProductPurchase
          product={product}
          color={color}
          onColorChange={setColor}
          initialSize={initial.size}
          sticky={sticky}
          sizeGuideHref={sizeGuideHref}
          whatsapp={whatsapp}
          pageUrl={pageUrl}
        />
        {children}
      </div>
    </div>
  )
}
