'use client'

import Link from 'next/link'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { fetchLowStockList } from '@/lib/inventory-api'
import { StockTable } from './stock-table'

/**
 * What needs reordering: active variants of LIVE products at or below their
 * alert limit, emptiest first — the same rule as the low-stock alert emails.
 */
export function LowStockList() {
  const { state, retry, refresh } = useLoad(fetchLowStockList)
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/inventory"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Inventory
      </Link>
      <h1 className="text-2xl font-semibold">Low stock</h1>
      <Panel
        title="To reorder"
        subtitle={
          state.status === 'ok'
            ? `Store-wide alert limit: ${state.data.threshold} (sizes can have their own)`
            : undefined
        }
        state={state}
        retry={retry}
      >
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is running low.</p>
          ) : (
            <StockTable rows={data.items} onChanged={refresh} />
          )
        }
      </Panel>
    </div>
  )
}
