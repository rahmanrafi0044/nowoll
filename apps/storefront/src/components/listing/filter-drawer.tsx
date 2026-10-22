'use client'

import { type ReactNode, useId, useRef } from 'react'
import { CloseIcon } from '../icons'

/**
 * "Filter" (design refresh 38f): one button opens the filters in a panel from
 * the left — on phones AND computers, so the products get the whole width.
 * A real <dialog>: focus stays inside, Escape or a click outside closes it.
 */
export function FilterDrawer({
  activeCount,
  children,
}: {
  activeCount: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const close = () => ref.current?.close()
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex h-11 items-center gap-2 border border-foreground px-5 text-sm font-medium hover:bg-foreground hover:text-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
        Filter{activeCount > 0 && ` (${activeCount})`}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={(e) => e.target === ref.current && close()}
        className="m-0 mr-auto h-dvh max-h-none w-full max-w-sm bg-surface-raised p-0 text-foreground backdrop:bg-black/30 open:motion-safe:animate-[drawer-in-left_0.3s_var(--ease-out-soft)]"
      >
        <div className="flex h-full flex-col px-5 pb-5">
          <div className="flex items-center justify-between border-b border-border py-4">
            <h2 id={titleId} className="text-2xl">
              Filter
            </h2>
            <button
              type="button"
              onClick={close}
              className="inline-flex size-10 items-center justify-center focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span className="sr-only">Close filters</span>
              <CloseIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </dialog>
    </>
  )
}
