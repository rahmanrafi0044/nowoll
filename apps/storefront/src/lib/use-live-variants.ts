'use client'

import type { ApiResult, ProductVariantView } from '@nowoll/types'
import { useEffect, useState } from 'react'
import { publicEnv } from '@/lib/env'

/**
 * Live stock for a product page (fix, Oct 2026).
 *
 * WHY: the product page itself is pre-built and reused for up to a minute (ISR,
 * fast for ad visitors), its data for another minute, and the browser's own
 * page memory can add a few more. So right after a restock the saved page could
 * still say "Sold out" — while quick view, which asks the API fresh, showed
 * "Add to bag". Now the page shows the saved sizes at once, then swaps in the
 * live ones from GET /variants/product/:id (never cached, a few hundred bytes).
 * If that request fails, the saved sizes simply stay — and the bag/checkout
 * check stock again anyway, so nobody can buy what isn't there.
 */
export function useLiveVariants(
  productId: string,
  saved: ProductVariantView[],
): ProductVariantView[] {
  const [live, setLive] = useState<ProductVariantView[] | null>(null)

  useEffect(() => {
    let current = true
    fetch(`${publicEnv.apiUrl}/api/v1/variants/product/${encodeURIComponent(productId)}`, {
      cache: 'no-store',
    })
      .then((r) => r.json() as Promise<ApiResult<ProductVariantView[]>>)
      .then((body) => {
        if (current && body.success && Array.isArray(body.data)) setLive(body.data)
      })
      .catch(() => {}) // offline / API down: keep the saved sizes
    return () => {
      current = false
    }
  }, [productId])

  return live ?? saved
}
