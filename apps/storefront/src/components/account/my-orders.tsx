'use client'

import { Button } from '@nowoll/ui'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { STATUS_LABEL, formatDate } from '@/components/orders/order-status'
import { useAccountData } from '@/hooks/use-account-data'
import { fetchMyOrders } from '@/lib/account-api'
import { formatBdt } from '@/lib/format'

/** /account/orders — orders placed while signed in, newest first. */
export function MyOrders({ limit }: { limit?: number }) {
  const [page, setPage] = useState(1)
  const { data, error } = useAccountData(() => fetchMyOrders(page), [page])

  if (error)
    return (
      <p role="alert" className="text-danger">
        {error.message}
      </p>
    )
  if (!data) return <p className="text-muted-foreground">Loading your orders…</p>
  if (data.total === 0)
    return (
      <div className="flex flex-col gap-2">
        <p>No orders yet.</p>
        <p className="text-sm text-muted-foreground">
          Orders you place while signed in appear here. Ordered as a guest?{' '}
          <Link
            href="/orders/track"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Track it with its number
          </Link>
          .
        </p>
      </div>
    )

  const orders = limit ? data.items.slice(0, limit) : data.items
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
        {orders.map((o) => (
          <li key={o.displayNumber}>
            <Link
              href={`/account/orders/${o.displayNumber}`}
              className="flex items-center gap-4 p-4 hover:bg-surface-muted"
            >
              <div className="flex -space-x-3">
                {o.imageUrls.map((url) => (
                  <div
                    key={url}
                    className="relative size-12 overflow-hidden rounded-control border-2 border-surface bg-surface-muted"
                  >
                    <Image src={url} alt="" fill sizes="48px" className="object-cover" />
                  </div>
                ))}
              </div>
              <div className="flex-1 text-sm">
                <p className="font-medium">{o.displayNumber}</p>
                <p className="text-muted-foreground">
                  {formatDate(o.placedAt)} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-medium tabular-nums">{formatBdt(o.total)}</p>
                <p className="text-muted-foreground">{STATUS_LABEL[o.status]}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {!limit && data.totalPages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Newer
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Older
          </Button>
        </nav>
      )}
    </div>
  )
}
