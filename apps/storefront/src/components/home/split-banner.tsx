import type { HomepageSection } from '@nowoll/validation'
import Image from 'next/image'
import Link from 'next/link'

type Split = Extract<HomepageSection, { type: 'split' }>

/**
 * A tall photo on one side, a heading, a few words and a button on the other
 * (design refresh 38f). The admin picks which side the photo sits on, so two
 * of these in a row can zig-zag. Phones: photo on top, words below.
 */
export function SplitBanner({ section: s }: { section: Split }) {
  const headingId = `${s.id}-heading`
  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-7xl px-4 py-12 md:py-20">
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-16" data-reveal>
        <div
          className={`relative aspect-[4/5] overflow-hidden bg-surface-muted ${
            s.imageSide === 'right' ? 'md:order-last' : ''
          }`}
        >
          <Image
            src={s.imageUrl}
            alt={s.imageAlt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex max-w-md flex-col items-start gap-4">
          <h2 id={headingId} className="text-4xl leading-tight md:text-5xl">
            {s.heading}
          </h2>
          {s.text && <p className="text-muted-foreground">{s.text}</p>}
          {s.href && s.ctaLabel && (
            <Link
              href={s.href}
              className="mt-2 border-b border-foreground pb-1 text-sm font-medium hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              {s.ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
