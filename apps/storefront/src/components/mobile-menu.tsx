'use client'

import type { CategoryNode } from '@nowoll/types'
import Link from 'next/link'
import { useEffect, useId, useState } from 'react'

// The "☰" menu on phones. A Client Component because it opens and closes.
// Accessibility: the button says whether the menu is open (aria-expanded) and
// which element it controls; Escape closes it; choosing a link closes it.
export function MobileMenu({ categories }: { categories: CategoryNode[] }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-11 items-center justify-center rounded-control hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
      >
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <nav
          id={panelId}
          aria-label="Categories"
          className="absolute inset-x-0 top-full z-40 border-b border-border bg-surface shadow-sm"
        >
          <ul className="mx-auto max-w-7xl px-4 py-2">
            <li>
              <Link href="/shop" onClick={() => setOpen(false)} className="block py-3 font-medium">
                Shop all
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/shop/${c.slug}`}
                  onClick={() => setOpen(false)}
                  className="block py-3 font-medium"
                >
                  {c.name}
                </Link>
                {c.children.length > 0 && (
                  <ul className="mb-2 border-l border-border pl-4">
                    {c.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/shop/${child.slug}`}
                          onClick={() => setOpen(false)}
                          className="block py-2 text-muted-foreground"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
