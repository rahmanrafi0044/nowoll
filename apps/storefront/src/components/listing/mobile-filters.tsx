'use client'

import { type ReactNode, useState } from 'react'
import { Modal } from '@/components/modal'

// Phones: a "Filters" button opens the filter form full-screen-ish.
// (The same form shows as a sidebar on larger screens.)
export function MobileFilters({
  activeCount,
  children,
}: {
  activeCount: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-control border border-border-strong px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand"
      >
        Filters{activeCount > 0 && ` (${activeCount})`}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Filters">
        {children}
      </Modal>
    </div>
  )
}
