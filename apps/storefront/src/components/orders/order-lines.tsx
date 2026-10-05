import type { OrderLineView } from '@nowoll/types'
import Image from 'next/image'
import { formatBdt } from '@/lib/format'

/** The items of a placed order — names and prices exactly as they were ordered. */
export function OrderLines({ items }: { items: OrderLineView[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-3 text-sm">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-control bg-surface-muted">
            {item.imageUrl && (
              <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium">{item.productName}</p>
            <p className="text-muted-foreground">
              {item.variantLabel} · {item.quantity} × {formatBdt(item.unitPrice)}
            </p>
          </div>
          <p className="tabular-nums">{formatBdt(item.lineTotal)}</p>
        </li>
      ))}
    </ul>
  )
}
