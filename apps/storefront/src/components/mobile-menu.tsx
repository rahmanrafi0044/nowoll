'use client'

import type { NavLink } from '@/lib/navigation'
import { useEffect, useId, useState } from 'react'
import { NavAnchor } from './nav-link'

// The "☰" menu on phones. A Client Component because it opens and closes.
// Accessibility: the button says whether the menu is open (aria-expanded) and
// which element it controls; Escape closes it; choosing a link closes it.
export function MobileMenu({ links }: { links: NavLink[] }) {
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
          aria-label="Menu"
          className="absolute inset-x-0 top-full z-40 border-b border-border bg-surface shadow-sm"
        >
          <ul className="mx-auto max-w-7xl px-4 py-2">
            {links.map((l) => (
              <li key={l.key}>
                <NavAnchor
                  link={l}
                  onClick={() => setOpen(false)}
                  className="block py-3 font-medium"
                />
                {l.children.length > 0 && (
                  <ul className="mb-2 border-l border-border pl-4">
                    {l.children.map((child) => (
                      <li key={child.key}>
                        <NavAnchor
                          link={child}
                          onClick={() => setOpen(false)}
                          className="block py-2 text-muted-foreground"
                        />
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
