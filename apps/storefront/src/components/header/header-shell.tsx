'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * The header's behaviour (design refresh 38f): it stays at the top of the
 * screen, slides away while you scroll DOWN (more room for photos on a phone)
 * and comes back as soon as you scroll UP. It never hides:
 *  - near the top of the page,
 *  - while something inside it has keyboard focus or a menu is open,
 *  - for "reduce motion" visitors it still hides, just without the slide.
 * No backdrop blur and no transform while shown: either would make the header
 * the frame for "fixed" things inside it, cutting the phone menu off (38f bug).
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const el = ref.current
        const busy =
          !!el && (el.contains(document.activeElement) || !!el.querySelector('[data-open="true"]'))
        if (y < 120 || busy) setHidden(false)
        else if (Math.abs(y - lastY) > 6) setHidden(y > lastY)
        lastY = y
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      ref={ref}
      data-hidden={hidden}
      onFocusCapture={() => setHidden(false)}
      className="sticky top-0 z-40 border-b border-border bg-surface transition-transform duration-300 ease-(--ease-out-soft) motion-reduce:transition-none data-[hidden=true]:-translate-y-full"
    >
      {children}
    </header>
  )
}
