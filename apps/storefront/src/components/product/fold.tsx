import type { ReactNode } from 'react'

/**
 * One fold of product information (design refresh 38f: Details, Fabric & care,
 * Size guide, Delivery & returns). The browser's own <details>: it opens and
 * closes without JavaScript, keyboard and screen readers know it, and a
 * search engine still reads what's inside.
 */
export function Fold({
  id,
  title,
  open = false,
  children,
}: {
  id?: string
  title: string
  open?: boolean
  children: ReactNode
}) {
  return (
    <details id={id} open={open} className="group scroll-mt-24 border-b border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg">{title}</h2>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4 transition-transform group-open:rotate-45 motion-reduce:transition-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </summary>
      <div className="pb-5 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  )
}
