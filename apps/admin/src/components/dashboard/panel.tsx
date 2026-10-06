import { Button } from '@nowoll/ui'
import { type ReactNode, useId } from 'react'
import type { LoadState } from './use-load'

/** One dashboard box: a titled card that shows loading / error / its content. */
export function Panel<T>({
  title,
  subtitle,
  state,
  retry,
  className,
  children,
}: {
  title: string
  subtitle?: string
  state: LoadState<T>
  retry: () => void
  className?: string
  children: (data: T) => ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={`rounded-lg border border-border bg-surface p-5 ${className ?? ''}`}
    >
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">
        {state.status === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
        {state.status === 'error' && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-danger">Couldn’t load this. {state.message}</span>
            <Button variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        )}
        {state.status === 'ok' && children(state.data)}
      </div>
    </section>
  )
}
