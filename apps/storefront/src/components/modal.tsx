'use client'

import { type ReactNode, useEffect, useId, useRef } from 'react'

// A pop-up built on the browser's native <dialog> element. showModal() gives
// us, for free: focus moves into the dialog and stays there (a "focus trap"),
// Escape closes it, and the rest of the page can't be clicked or read by
// screen readers while it's open.
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose} // fires on Escape too
      // A click on the dialog element itself (not its content) is a click on the dimmed backdrop.
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-control bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/50`}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="-m-2 inline-flex size-10 items-center justify-center rounded-control hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span className="sr-only">Close</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
