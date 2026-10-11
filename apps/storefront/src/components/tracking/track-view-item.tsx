'use client'

import { newEventId, viewItemEvent } from '@nowoll/analytics'
import { useEffect } from 'react'
import { track } from '@/stores/tracking-store'

/** Product page opened → "view item" (GA4) / ViewContent (Meta). Renders nothing. */
export function TrackViewItem({
  productId,
  name,
  price,
}: {
  productId: string
  name: string
  price: number
}) {
  useEffect(() => {
    track(viewItemEvent({ productId, name, price }, newEventId()))
  }, [productId, name, price])
  return null
}
