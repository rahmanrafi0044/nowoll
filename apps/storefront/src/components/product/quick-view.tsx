'use client'

import type { ApiResult, ProductDetailView } from '@nowoll/types'
import Link from 'next/link'
import { useState } from 'react'
import { Modal } from '@/components/modal'
import { publicEnv } from '@/lib/env'
import { ProductView } from './product-view'

type Load = { state: 'idle' | 'loading' | 'error' } | { state: 'ready'; product: ProductDetailView }

// "Quick view" on listing pages: choose size/color and add to the bag without
// leaving the list. Product details are loaded only when the button is used.
export function QuickView({ slug, name }: { slug: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<Load>({ state: 'idle' })

  async function openQuickView() {
    setOpen(true)
    if (load.state === 'ready') return
    setLoad({ state: 'loading' })
    try {
      const res = await fetch(`${publicEnv.apiUrl}/api/v1/products/${encodeURIComponent(slug)}`)
      const body = (await res.json()) as ApiResult<ProductDetailView>
      setLoad(body.success ? { state: 'ready', product: body.data } : { state: 'error' })
    } catch {
      setLoad({ state: 'error' })
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openQuickView}
        // relative z-10: sits above the card's stretched product link
        className="relative z-10 w-full rounded-control border border-border-strong bg-surface py-2 text-sm font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
      >
        Quick view<span className="sr-only">: {name}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={name} wide>
        {load.state === 'loading' && (
          <p className="py-12 text-center text-muted-foreground">Loading…</p>
        )}
        {load.state === 'error' && (
          <p role="alert" className="py-12 text-center text-danger">
            Couldn&apos;t load this product. Please try again.
          </p>
        )}
        {load.state === 'ready' && (
          <ProductView product={load.product}>
            <Link
              href={`/products/${slug}`}
              className="text-sm font-medium underline underline-offset-4"
            >
              View full details
            </Link>
          </ProductView>
        )}
      </Modal>
    </>
  )
}
