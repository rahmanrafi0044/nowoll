'use client'

import type { InventoryRow, StockAdjustResult } from '@nowoll/types'
import { Badge, Button } from '@nowoll/ui'
import Link from 'next/link'
import { useState } from 'react'
import { AdjustDialog } from './adjust-dialog'
import { HistoryDialog } from './history-dialog'

/**
 * Variants with their stock, plus the two pop-ups (change stock, history).
 * Shared by the inventory page and the low-stock page.
 */
export function StockTable({ rows, onChanged }: { rows: InventoryRow[]; onChanged: () => void }) {
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null)
  const [viewing, setViewing] = useState<InventoryRow | null>(null)
  const [saved, setSaved] = useState<{ label: string; result: StockAdjustResult } | null>(null)

  return (
    <>
      {saved && (
        <p role="status" className="mb-3 rounded-control bg-success-soft p-3 text-sm text-success">
          {saved.label}: {saved.result.before} → {saved.result.after}
          {saved.result.logId === null && ' (it already was that — nothing changed)'}
        </p>
      )}
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 font-medium">Product</th>
              <th className="py-2 font-medium">Size / colour</th>
              <th className="py-2 font-medium">SKU</th>
              <th className="py-2 text-right font-medium">Stock</th>
              <th className="py-2 text-right font-medium">Alert at</th>
              <th className="py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.variantId} className="border-b border-border align-middle">
                <td className="py-2">
                  <Link
                    href={`/admin/products/${r.product.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.product.name}
                  </Link>
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    {r.product.status !== 'ACTIVE' && <Badge variant="neutral">Draft</Badge>}
                    {!r.isActive && <Badge variant="neutral">Not on sale</Badge>}
                  </span>
                </td>
                <td className="py-2">
                  {r.size} / {r.color}
                </td>
                <td className="py-2 text-muted-foreground">{r.sku}</td>
                <td className="py-2 text-right tabular-nums">
                  <span
                    className={
                      r.stock === 0
                        ? 'font-semibold text-danger'
                        : r.isLow
                          ? 'font-semibold text-warning'
                          : ''
                    }
                  >
                    {r.stock === 0 ? 'Sold out' : r.stock}
                  </span>
                  {r.isLow && r.stock > 0 && <span className="sr-only"> (low)</span>}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {r.threshold}
                  {r.usesStoreThreshold && <span className="sr-only"> (store setting)</span>}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Change stock of ${r.product.name} ${r.size} / ${r.color}`}
                    onClick={() => {
                      setSaved(null)
                      setAdjusting(r)
                    }}
                  >
                    Change stock
                  </Button>{' '}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`History of ${r.product.name} ${r.size} / ${r.color}`}
                    onClick={() => setViewing(r)}
                  >
                    History
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AdjustDialog
        row={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={(result) => {
          setSaved({
            label: `${adjusting!.product.name} ${adjusting!.size} / ${adjusting!.color}`,
            result,
          })
          setAdjusting(null)
          onChanged()
        }}
      />
      <HistoryDialog row={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
