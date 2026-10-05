'use client'

import { useRouter } from 'next/navigation'

// Changing the sort navigates immediately (no Apply button needed).
// The server pre-computes each option's URL, so the URL rules live in one place.
export function SortSelect({
  options,
  current,
}: {
  options: { value: string; label: string; href: string }[]
  current: string
}) {
  const router = useRouter()
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Sort by</span>
      <select
        value={current}
        onChange={(e) => {
          const target = options.find((o) => o.value === e.target.value)
          if (target) router.push(target.href)
        }}
        className="h-11 rounded-control border border-border-strong bg-surface px-3 text-base sm:text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
