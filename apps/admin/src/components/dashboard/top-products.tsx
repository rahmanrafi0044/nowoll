import type { TopProducts as TopProductsData } from '@nowoll/types'
import { formatBdt } from '@/lib/format'

/** Best sellers — by units sold, then sales. Sales are before order discounts. */
export function TopProducts({ data }: { data: TopProductsData }) {
  if (data.items.length === 0)
    return <p className="text-sm text-muted-foreground">No sales in this period yet.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-1.5 font-medium">Product</th>
          <th className="py-1.5 text-right font-medium">Sold</th>
          <th className="py-1.5 text-right font-medium">Sales</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((p) => (
          <tr key={p.productId ?? `deleted:${p.name}`} className="border-b border-border">
            <td className="py-2">
              {p.name}
              {p.productId === null && (
                <span className="ml-2 text-xs text-muted-foreground">(deleted)</span>
              )}
            </td>
            <td className="py-2 text-right tabular-nums">{p.unitsSold}</td>
            <td className="py-2 text-right tabular-nums">{formatBdt(p.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
