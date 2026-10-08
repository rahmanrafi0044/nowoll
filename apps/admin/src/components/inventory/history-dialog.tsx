'use client'

import type { InventoryReason, InventoryRow } from '@nowoll/types'
import Link from 'next/link'
import { useCallback } from 'react'
import { Dialog } from '@/components/dialog'
import { useLoad } from '@/components/dashboard/use-load'
import { formatInstantDateTime } from '@/lib/date'
import { fetchStockHistory } from '@/lib/inventory-api'

const REASON: Record<InventoryReason, string> = {
  INITIAL_STOCK: 'Starting stock',
  ORDER_PLACED: 'Order placed',
  ORDER_CANCELLED: 'Order cancelled — back on sale',
  RETURN_RESTOCKED: 'Return restocked',
  MANUAL_ADJUSTMENT: 'Changed by hand',
  CSV_IMPORT: 'CSV import',
}

/** Every stock change of one variant, newest first. */
export function HistoryDialog({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  return (
    <Dialog title="Stock history" open={row !== null} onClose={onClose}>
      {row && <History key={row.variantId} row={row} />}
    </Dialog>
  )
}

function History({ row }: { row: InventoryRow }) {
  const load = useCallback(() => fetchStockHistory(row.variantId), [row.variantId])
  const { state, retry } = useLoad(load)
  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
      <p className="text-sm">
        <span className="font-medium">{row.product.name}</span> · {row.size} / {row.color} ·{' '}
        {row.sku}
      </p>
      {state.status === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {state.message}{' '}
          <button type="button" className="underline" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {state.status === 'ok' &&
        (state.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border text-sm">
            {state.data.items.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{REASON[e.reason]}</span>
                  {e.order && (
                    <>
                      {' · '}
                      <Link
                        href={`/admin/orders/${e.order.id}`}
                        className="underline underline-offset-4"
                      >
                        {e.order.number}
                      </Link>
                    </>
                  )}
                  {e.note && <span className="block">{e.note}</span>}
                  <span className="block text-xs text-muted-foreground">
                    {formatInstantDateTime(e.createdAt)} · {e.actor ? e.actor.name : 'Automatic'}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={e.change > 0 ? 'text-success' : 'text-danger'}>
                    {e.change > 0 ? `+${e.change}` : `−${Math.abs(e.change)}`}
                  </span>
                  <span className="block text-xs text-muted-foreground">→ {e.stockAfter}</span>
                </span>
              </li>
            ))}
          </ol>
        ))}
      {state.status === 'ok' && state.data.total > state.data.items.length && (
        <p className="text-xs text-muted-foreground">
          Showing the latest {state.data.items.length} of {state.data.total}.
        </p>
      )}
    </div>
  )
}
