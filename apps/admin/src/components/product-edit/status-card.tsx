'use client'

import type { AdminProductDetail } from '@nowoll/types'
import { Badge, Button } from '@nowoll/ui'
import { useState } from 'react'
import { FormProblem } from '@/components/form-fields'
import { publicEnv } from '@/lib/env'
import { archiveProduct, updateProduct } from '@/lib/products-api'

const MISSING = { variant: 'an active size/colour', image: 'a photo' } as const

/** Draft ↔ Live, and Archive. Publish stays greyed out until the product is ready. */
export function StatusCard({
  product,
  onChanged,
  onArchived,
}: {
  product: AdminProductDetail
  onChanged: () => void
  onArchived: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  async function run(request: Promise<{ ok: boolean; message?: string }>, after: () => void) {
    setBusy(true)
    setProblem(null)
    const r = await request
    setBusy(false)
    if (!r.ok) return setProblem(r.message ?? 'Something went wrong.')
    after()
  }

  if (product.status === 'ARCHIVED')
    return (
      <div className="flex flex-col gap-2">
        <Badge variant="warning" className="self-start">
          Archived
        </Badge>
        <p className="text-sm text-muted-foreground">
          Hidden from the shop and the product list. It’s kept so past orders still show it, and
          can’t be edited.
        </p>
      </div>
    )

  const live = product.status === 'ACTIVE'
  const missing = product.missingToPublish.map((m) => MISSING[m])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge variant={live ? 'success' : 'neutral'}>{live ? 'Live' : 'Draft'}</Badge>
        <span className="text-sm text-muted-foreground">
          {live ? 'Customers can see and buy it.' : 'Hidden from the shop.'}
        </span>
      </div>

      {live ? (
        <>
          <a
            href={`${publicEnv.siteUrl}/products/${product.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium underline underline-offset-4"
          >
            View in the shop ↗
          </a>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(updateProduct(product.id, { status: 'DRAFT' }), onChanged)}
          >
            Move to draft
          </Button>
        </>
      ) : (
        <>
          <Button
            disabled={busy || missing.length > 0}
            aria-describedby={missing.length > 0 ? 'publish-needs' : undefined}
            onClick={() => run(updateProduct(product.id, { status: 'ACTIVE' }), onChanged)}
          >
            Publish
          </Button>
          {missing.length > 0 && (
            <p id="publish-needs" className="text-sm text-warning">
              Needs {missing.join(' and ')} before it can go live.
            </p>
          )}
        </>
      )}

      {confirmArchive ? (
        <div className="flex flex-col gap-2 rounded-control border border-border-strong p-3 text-sm">
          <p>
            Archive “{product.name}”? It disappears from the shop and the product list. Past orders
            keep it. This can’t be undone here.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => run(archiveProduct(product.id), onArchived)}
            >
              Archive product
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setConfirmArchive(true)}
        >
          Archive…
        </Button>
      )}
      <FormProblem message={problem} />
    </div>
  )
}
