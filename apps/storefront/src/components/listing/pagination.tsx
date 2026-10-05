import Link from 'next/link'

/** Page numbers to show: always first and last, current ±1, "…" for gaps. */
export function pageItems(current: number, total: number): (number | '…')[] {
  const pages = new Set(
    [1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total),
  )
  const sorted = [...pages].sort((a, b) => a - b)
  const items: (number | '…')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) items.push('…')
    items.push(p)
  })
  return items
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
}) {
  if (totalPages <= 1) return null
  const linkClass =
    'flex h-11 min-w-11 items-center justify-center rounded-control border border-border-strong px-3 text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand'

  return (
    <nav aria-label="Pages" className="mt-10 flex justify-center">
      <ul className="flex items-center gap-2">
        {page > 1 && (
          <li>
            <Link
              href={hrefFor(page - 1)}
              rel="prev"
              aria-label="Previous page"
              className={linkClass}
            >
              <span aria-hidden="true">←</span>
            </Link>
          </li>
        )}
        {pageItems(page, totalPages).map((item, i) =>
          item === '…' ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Page ${item}`}
                className={`${linkClass} ${item === page ? 'border-brand bg-brand text-brand-foreground hover:bg-brand' : ''}`}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        {page < totalPages && (
          <li>
            <Link href={hrefFor(page + 1)} rel="next" aria-label="Next page" className={linkClass}>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )
}
