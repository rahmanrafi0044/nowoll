'use client'

import type { BulkProductAction } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { useState } from 'react'

const ACTIONS: { action: BulkProductAction; label: string }[] = [
  { action: 'publish', label: 'Publish' },
  { action: 'unpublish', label: 'Move to draft' },
  { action: 'feature', label: 'Feature' },
  { action: 'unfeature', label: 'Unfeature' },
]

/** Shown while products are ticked. Archive asks first — it hides products everywhere. */
export function BulkBar({
  count,
  busy,
  onAction,
  onClear,
}: {
  count: number
  busy: boolean
  onAction: (action: BulkProductAction) => void
  onClear: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const label = `${count} product${count === 1 ? '' : 's'}`
  return (
    <div
      role="toolbar"
      aria-label="Actions for the selected products"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-surface p-3"
    >
      {confirming ? (
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
