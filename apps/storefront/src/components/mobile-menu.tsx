'use client'

import Image from 'next/image'
import { useEffect, useId, useRef, useState } from 'react'
import type { NavLink } from '@/lib/navigation'
import { CloseIcon, MenuIcon } from './icons'
import { NavAnchor } from './nav-link'

// The "☰" menu on phones and tablets (design refresh 38f): a panel that slides
// in from the left — each category with its photo, its subcategories under it.
// Accessibility: the button says whether the menu is open (aria-expanded) and
// which element it controls; focus moves into the panel; Escape, the backdrop
// or choosing a link closes it, and focus goes back to the ☰ button.
export function MobileMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      toggleRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    // The page behind doesn't scroll while the menu is open.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open])

  function close() {
    setOpen(false)
    toggleRef.current?.focus()
  }

  return (
    <div className="lg:hidden" data-open={open}>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="relative z-50 inline-flex size-11 items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-brand"
      >
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        {open ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-40 bg-black/30 motion-safe:animate-[fade-in_0.2s_ease-out]"
          />
          <nav
            ref={panelRef}
            id={panelId}
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-40 w-[85%] max-w-sm overflow-y-auto bg-surface-raised px-5 pt-20 pb-10 shadow-xl motion-safe:animate-[drawer-in-left_0.3s_var(--ease-out-soft)]"
          >
            <ul className="flex flex-col divide-y divide-border">
              {links.map((l) => (
                <li key={l.key} className="py-3">
                  <NavAnchor
                    link={l}
                    onClick={close}
                    className="flex items-center gap-4 font-display text-xl"
                  />
                  {l.children.length > 0 && (
                    <ul className="mt-3 grid grid-cols-2 gap-3">
                      {l.children.map((child) => (
                        <li key={child.key}>
                          <MenuTile link={child} onClick={close} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  )
}

/** A subcategory: its photo (when it has one) with the name under it. */
function MenuTile({ link, onClick }: { link: NavLink; onClick: () => void }) {
  if (!link.imageUrl)
    return <NavAnchor link={link} onClick={onClick} className="block py-1 text-muted-foreground" />
  return (
    <span className="relative flex flex-col gap-1.5">
      <span className="relative block aspect-[4/5] overflow-hidden bg-surface-muted">
        <Image src={link.imageUrl} alt="" fill sizes="45vw" className="object-cover" />
      </span>
      <NavAnchor link={link} onClick={onClick} className="text-sm after:absolute after:inset-0" />
    </span>
  )
}
