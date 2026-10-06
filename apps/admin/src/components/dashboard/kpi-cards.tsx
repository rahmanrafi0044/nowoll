import type { AnalyticsSummary } from '@nowoll/types'
import { formatBdt, percentChange } from '@/lib/format'

// STAT TILES: label · value · change vs the 7 days before. A number on its
// own says little — "▲ 20%" says whether the week was good. The change is
// colour + arrow + words, never colour alone.
export function KpiCards({ summary: s }: { summary: AnalyticsSummary }) {
  const prevAov =
    s.previous7Days.orders === 0 ? 0 : Number(s.previous7Days.revenue) / s.previous7Days.orders
  const tiles = [
    {
      label: 'Sales today',
      value: formatBdt(s.today.revenue),
      note: plural(s.today.orders, 'order'),
    },
    {
      label: 'Sales, last 7 days',
      value: formatBdt(s.last7Days.revenue),
      change: percentChange(Number(s.last7Days.revenue), Number(s.previous7Days.revenue)),
      note: plural(s.last7Days.orders, 'order'),
    },
    {
      label: 'Average order, last 7 days',
      value: formatBdt(s.last7Days.averageOrderValue),
      change: percentChange(Number(s.last7Days.averageOrderValue), prevAov),
    },
    {
      label: 'New customers, last 7 days',
      value: String(s.newCustomers.last7Days),
      change: percentChange(s.newCustomers.last7Days, s.newCustomers.previous7Days),
    },
  ]
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <li key={t.label} className="rounded-lg border border-border bg-surface p-5">
          <p className="text-sm text-muted-foreground">{t.label}</p>
          <p className="mt-1 text-2xl font-semibold">{t.value}</p>
          <p className="mt-1 flex flex-wrap gap-x-2 text-sm">
            {'change' in t && <Change value={t.change ?? null} />}
            {t.note && <span className="text-muted-foreground">{t.note}</span>}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">nothing the week before</span>
  if (value === 0) return <span className="text-muted-foreground">same as the week before</span>
  const up = value > 0
  return (
    <span className={up ? 'text-success' : 'text-danger'}>
      <span aria-hidden="true">{up ? '▲' : '▼'} </span>
      {up ? 'up' : 'down'} {Math.abs(value)}% vs the week before
    </span>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
