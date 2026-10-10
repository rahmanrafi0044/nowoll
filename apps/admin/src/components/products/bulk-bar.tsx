'use client'

import type { BulkProductAction } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { useState } from 'react'
import { flattenCategories } from '@/lib/categories'
import type { CategoryNode } from '@/lib/products-api'

const ACTIONS: { action: Exclude<BulkProductAction, 'move' | 'archive'>; label: string }[] = [
  { action: 'publish', label: 'Publish' },
  { action: 'unpublish', label: 'Move to draft' },
  { action: 'feature', label: 'Feature' },
  { action: 'unfeature', label: 'Unfeature' },
]

/**
 * Shown while products are ticked. Archive asks first — it hides products
 * everywhere. "Move to category…" (step 36b) picks the category first.
 */
export function BulkBar({
  count,
  busy,
  categories,
  onAction,
  onClear,
}: {
  count: number
  busy: boolean
  categories: CategoryNode[]
  onAction: (action: BulkProductAction, categoryId?: string) => void
  onClear: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [moving, setMoving] = useState(false)
  const [target, setTarget] = useState('')
  const label = `${count} product${count === 1 ? '' : 's'}`
  return (
    <div
      role="toolbar"
      aria-label="Actions for the selected products"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-surface p-3"
    >
      {moving ? (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            Move {label} to
            <select
              className="h-9 rounded-control border border-border-strong bg-surface px-2 text-sm"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a category…</option>
              {flattenCategories(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            disabled={busy || !target}
            onClick={() => {
              setMoving(false)
              onAction('move', target)
              setTarget('')
            }}
          >
            Move
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMoving(false)}>
            Cancel
          </Button>
        </>
      ) : confirming ? (
        <>
          <span className="text-sm font-medium">
            Archive {label}? They disappear from the shop and this list (orders keep them).
          </span>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => {
              setConfirming(false)
              onAction('archive')
            }}
          >
            Archive {label}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="mr-2 text-sm font-medium">{label} selected</span>
          {ACTIONS.map((a) => (
            <Button
              key={a.action}
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onAction(a.action)}
            >
              {a.label}
            </Button>
          ))}
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setMoving(true)}>
            Move to category…
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            Archive…
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear selection
          </Button>
        </>
      )}
    </div>
  )
}
