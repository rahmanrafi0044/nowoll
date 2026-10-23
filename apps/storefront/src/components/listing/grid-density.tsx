'use client'

import { type ReactNode, useEffect } from 'react'
import { useUiStore } from '@/stores/ui-store'

const STORAGE_KEY = 'nowoll-grid'

/**
 * How many products per row (design refresh 38f): "more" = 2 on phones, 4 on
 * computers; "bigger" = 1 on phones, 3 on computers. Remembered in this
 * browser only (a convenience — nothing breaks if storage is blocked).
 */
export function DensityToggle() {
  const dense = useUiStore((s) => s.gridDense)
  const setDense = useUiStore((s) => s.setGridDense)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setDense(saved === 'more')
    } catch {
      // storage blocked → the default
    }
  }, [setDense])
  const choose = (more: boolean) => {
    setDense(more)
    try {
      localStorage.setItem(STORAGE_KEY, more ? 'more' : 'bigger')
    } catch {
      // storage blocked → just for this visit
    }
  }
  const btn = (active: boolean) =>
    `inline-flex size-10 items-center justify-center focus-visible:outline-2 focus-visible:outline-brand ${
      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
    }`
  return (
    <div role="group" aria-label="Products per row" className="flex items-center">
      <button
        type="button"
        aria-pressed={!dense}
        onClick={() => choose(false)}
        className={btn(!dense)}
      >
        <span className="sr-only">Bigger photos</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <rect x="4" y="4" width="7" height="16" />
          <rect x="13" y="4" width="7" height="16" />
        </svg>
      </button>
      <button
        type="button"
        aria-pressed={dense}
        onClick={() => choose(true)}
        className={btn(dense)}
      >
        <span className="sr-only">More products</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <rect x="3" y="4" width="4" height="16" />
          <rect x="10" y="4" width="4" height="16" />
          <rect x="17" y="4" width="4" height="16" />
        </svg>
      </button>
    </div>
  )
}

export interface GridItem {
  key: string
  node: ReactNode
  /** An editorial tile two columns wide (when the grid has two or more). */
  wide?: boolean
}

/** The product grid, in the chosen density. Cards and tiles are rendered on the server. */
export function ProductGrid({ items }: { items: GridItem[] }) {
  const dense = useUiStore((s) => s.gridDense)
  return (
    <ul
      className={`mt-6 grid gap-x-4 gap-y-10 ${
        dense
          ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      }`}
    >
      {items.map((it) => (
        <li key={it.key} className={it.wide ? (dense ? 'col-span-2' : 'sm:col-span-2') : undefined}>
          {it.node}
        </li>
      ))}
    </ul>
  )
}
