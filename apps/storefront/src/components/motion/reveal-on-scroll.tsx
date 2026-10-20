'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Expressive-but-calm motion (design refresh 38f): every element marked
 * `data-reveal` fades up when it scrolls into view. Mounted once in the layout.
 *
 * WHY like this:
 *  - Only elements that start BELOW the first screen are hidden, so what a
 *    visitor sees first is never delayed (Lighthouse's "main content" stays fast).
 *  - Without JavaScript nothing is hidden at all; with "reduce motion" set on
 *    the phone, this does nothing (and the CSS has no transition either).
 *  - One IntersectionObserver for the whole page, re-run after each navigation.
 * `style={{ '--reveal-order': i }}` on siblings staggers them (80 ms apart).
 */
export function RevealOnScroll() {
  const pathname = usePathname()
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.setAttribute('data-reveal', 'shown')
          observer.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    const below = window.innerHeight
    for (const el of document.querySelectorAll<HTMLElement>(
      '[data-reveal]:not([data-reveal="shown"])',
    )) {
      if (el.getBoundingClientRect().top < below) continue // on screen now: leave it alone
      el.setAttribute('data-reveal', 'hidden')
      observer.observe(el)
    }
    return () => observer.disconnect()
  }, [pathname])
  return null
}
