'use client'

import type { HomepageHero } from '@nowoll/validation'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/** How long each slide stays before the next (ms). */
const TURN_MS = 6000

type Slide = Omit<HomepageHero, 'more'>

// The big first section, from Admin → Content → Homepage → Hero.
// Design refresh (38f): up to 4 slides that take turns with a slow fade.
//
// WHY like this:
//  - Every slide is in the HTML from the start (stacked on top of each other);
//    only the opacity changes. No layout jump, and Google sees all of them.
//  - Only the FIRST photo loads with priority — it is the page's largest
//    element (Lighthouse "LCP"); the others load lazily.
//  - Things that move by themselves need a pause button (accessibility rule
//    WCAG 2.2.2). Hovering or keyboard focus also pauses; "reduce motion" on
//    the phone means no turning at all — the dots still work.
//  - Only the first slide's heading is the page's <h1> (one per page).
export function Hero({ data }: { data: Omit<HomepageHero, 'more'> & { more?: Slide[] } }) {
  const slides: Slide[] = [data, ...(data.more ?? [])]
  const count = slides.length
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [held, setHeld] = useState(false) // pointer over it / keyboard inside it

  useEffect(() => {
    if (count < 2 || !playing || held) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), TURN_MS)
    return () => window.clearInterval(t)
  }, [count, playing, held])

  return (
    <section
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label={count > 1 ? 'Highlights' : undefined}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      className="relative isolate grid min-h-[70svh] overflow-hidden bg-surface-muted sm:min-h-[82svh]"
    >
      {slides.map((s, i) => {
        const current = i === index
        return (
          <div
            key={i}
            aria-hidden={!current}
            inert={!current}
            className={`relative col-start-1 row-start-1 flex items-end transition-opacity duration-1000 ease-out motion-reduce:transition-none ${
              current ? 'z-10 opacity-100' : 'opacity-0'
            }`}
          >
            {s.imageUrl && (
              <>
                <Image
                  src={s.imageUrl}
                  alt={s.imageAlt ?? ''}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className={`-z-10 object-cover ${current ? 'motion-safe:animate-[hero-drift_9s_ease-out_both]' : ''}`}
                />
                {/* A soft shade at the bottom so white words stay readable on any photo */}
                <div
                  className="absolute inset-0 -z-10 bg-gradient-to-t from-black/60 via-black/15 to-transparent"
                  aria-hidden="true"
                />
              </>
            )}
            <div
              className={`mx-auto flex w-full max-w-7xl flex-col items-start gap-4 px-4 pt-24 pb-16 sm:pb-20 ${
                s.imageUrl ? 'text-white' : 'text-foreground'
              }`}
            >
              {i === 0 ? (
                <h1 className="max-w-2xl text-5xl leading-[1.05] sm:text-7xl">{s.heading}</h1>
              ) : (
                <h2 className="max-w-2xl text-5xl leading-[1.05] sm:text-7xl">{s.heading}</h2>
              )}
              {s.subheading && <p className="max-w-lg text-base opacity-90">{s.subheading}</p>}
              <Link
                href={s.ctaHref}
                className={`mt-3 inline-flex h-12 items-center px-8 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 ${
                  s.imageUrl
                    ? 'bg-white text-foreground hover:bg-surface focus-visible:outline-white'
                    : 'bg-foreground text-surface hover:opacity-90 focus-visible:outline-brand'
                }`}
              >
                {s.ctaLabel}
              </Link>
            </div>
          </div>
        )
      })}

      {count > 1 && (
        <div className="absolute right-4 bottom-5 z-20 flex items-center gap-3 sm:right-[max(1rem,calc((100vw-80rem)/2+1rem))]">
          <ul className="flex items-center gap-1" aria-label="Slides">
            {slides.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index}
                  className="group flex h-8 items-center px-1 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <span className="sr-only">
                    Show slide {i + 1}: {s.heading}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`block h-0.5 bg-white shadow transition-all duration-500 ${
                      i === index ? 'w-8' : 'w-4 opacity-50 group-hover:opacity-80'
                    }`}
                  />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex size-8 items-center justify-center text-white focus-visible:outline-2 focus-visible:outline-white"
          >
            <span className="sr-only">{playing ? 'Pause slides' : 'Play slides'}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
              <path d={playing ? 'M7 5h3v14H7zM14 5h3v14h-3z' : 'M8 5v14l11-7z'} />
            </svg>
          </button>
        </div>
      )}
    </section>
  )
}
