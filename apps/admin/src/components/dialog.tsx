'use client'

import { Button } from '@nowoll/ui'
import { type ReactNode, useEffect, useId, useRef } from 'react'

// ============================================================================
// A pop-up window built on the browser's own <dialog> element. With
// showModal() the BROWSER does the hard accessibility work: the rest of the
// page can't be clicked or tabbed into, focus moves inside, and Esc closes it.
// (Esc fires "cancel" then "close" — we listen to "close" for every way out.)
// ============================================================================
export function Dialog({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/40"
    >
      {open && (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={() => ref.current?.close()}
            >
              ✕
            </Button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
