'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import type { NavLink } from '@/lib/navigation'
import { ChevronDownIcon } from '../icons'
import { NavAnchor } from '../nav-link'

/**
 * The desktop menu with its drop-down ("mega menu", design refresh 38f): a top
 * item with subcategories opens a wide panel — each subcategory with its photo
 * (Admin → Categories) and its own subcategories as links.
 *
 * Opens on hover (mouse) OR with the small arrow button next to the item
 * (keyboard, touch screens) — the item's name always stays a normal link.
 * Escape or a click elsewhere closes it; aria-expanded tells screen readers.
 */
export function DesktopNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const baseId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(null)
      navRef.current?.querySelector<HTMLElement>(`[aria-controls="${baseId}-${open}"]`)?.focus()
    }
    const onClick = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open, baseId])

  const hoverOpen = (key: string) => {
    window.clearTimeout(closeTimer.current)
    setOpen(key)
  }
  // A short grace period, so moving the mouse down into the panel doesn't close it.
  const hoverClose = () => {
    closeTimer.current = window.setTimeout(() => setOpen(null), 150)
  }

  return (
    <nav ref={navRef} aria-label="Main" className="hidden lg:block">
      <ul className="flex items-center justify-center gap-8 text-sm">
        {links.map((l) => {
          const hasPanel = l.children.length > 0
          const panelId = `${baseId}-${l.key}`
          const isOpen = open === l.key
          return (
            <li
              key={l.key}
              data-open={isOpen}
              onMouseEnter={hasPanel ? () => hoverOpen(l.key) : undefined}
              onMouseLeave={hasPanel ? hoverClose : undefined}
              className="flex items-center"
            >
              <NavAnchor
                link={l}
                onClick={() => setOpen(null)}
                className="py-4 underline-offset-[6px] decoration-1 hover:underline"
              />
              {hasPanel && (
                <>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : l.key)}
                    className="ml-1 inline-flex size-6 items-center justify-center rounded-control text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <span className="sr-only">
                      {isOpen ? 'Hide' : 'Show'} {l.label} menu
                    </span>
                    <ChevronDownIcon
                      className={`size-3.5 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div
                    id={panelId}
                    hidden={!isOpen}
                    className="absolute inset-x-0 top-full border-y border-border bg-surface-raised shadow-[0_12px_24px_-12px_rgba(0,0,0,0.12)] motion-safe:animate-[menu-in_0.25s_var(--ease-out-soft)]"
                  >
                    <MegaPanel link={l} onChoose={() => setOpen(null)} />
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function MegaPanel({ link, onChoose }: { link: NavLink; onChoose: () => void }) {
  const withPhotos = link.children.some((c) => c.imageUrl)
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-5 gap-6 px-6 py-8 text-sm tracking-normal normal-case">
      {link.children.slice(0, 5).map((child) => (
        <div key={child.key} className="flex flex-col gap-3">
          {withPhotos && <NavAnchorWithPhoto link={child} onClick={onChoose} />}
          {!withPhotos && (
            <NavAnchor link={child} onClick={onChoose} className="font-display text-lg" />
          )}
          {child.children.length > 0 && (
            <ul className="flex flex-col gap-2 text-muted-foreground">
              {child.children.map((g) => (
                <li key={g.key}>
                  <NavAnchor link={g} onClick={onChoose} className="hover:text-foreground" />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div className="col-start-5 flex items-end justify-end">
        <Link
          href={link.href}
          onClick={onChoose}
          className="inline-flex items-center gap-2 border-b border-foreground pb-1 font-medium"
        >
          All {link.label}
        </Link>
      </div>
    </div>
  )
}

/** A subcategory as its photo with the name under it (hover: a slow zoom). */
function NavAnchorWithPhoto({ link, onClick }: { link: NavLink; onClick: () => void }) {
  return (
    <Link
      href={link.href}
      onClick={onClick}
      className="group/photo flex flex-col gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    >
      <span className="relative block aspect-[3/4] overflow-hidden bg-surface-muted">
        {link.imageUrl && (
          <Image
            src={link.imageUrl}
            alt=""
            fill
            sizes="220px"
            className="object-cover transition-transform duration-700 ease-(--ease-out-soft) group-hover/photo:scale-105 motion-reduce:transition-none"
          />
        )}
      </span>
      <span className="font-display text-lg">{link.label}</span>
    </Link>
  )
}
