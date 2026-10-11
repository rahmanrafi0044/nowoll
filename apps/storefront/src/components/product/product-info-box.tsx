import { type InfoLine, type ProductInfo } from '@nowoll/validation'
import Link from 'next/link'

// The "Delivery and returns" box under "Add to bag" (Admin → Content →
// Product info, step 38d). The lines come from productInfoLines() — the
// automatic ones follow the live delivery fees, return window and cash-on-
// delivery rules. Plain text only.

const ICON: Record<InfoLine['kind'], string> = {
  delivery:
    'M3 7h11v8H3zM14 10h4l3 3v2h-7M6 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  returns: 'M4 9h11a5 5 0 0 1 0 10H9M4 9l4-4M4 9l4 4',
  cod: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  custom: 'M5 12l4 4L19 6',
}

export function ProductInfoBox({ info, lines }: { info: ProductInfo; lines: InfoLine[] }) {
  if (lines.length === 0 && !info.link) return null
  return (
    <section aria-labelledby="product-info-title" className="rounded-lg border border-border p-4">
      <h2 id="product-info-title" className="mb-2 text-sm font-semibold">
        {info.title}
      </h2>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {lines.map((l, i) => (
          <li key={`${l.kind}-${i}`} className="flex gap-2">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mt-0.5 size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={ICON[l.kind]} />
            </svg>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
      {info.link &&
        (info.link.href.startsWith('https://') ? (
          <a
            href={info.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
          >
            {info.link.label}
          </a>
        ) : (
          <Link
            href={info.link.href}
            className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
          >
            {info.link.label}
          </Link>
        ))}
    </section>
  )
}
