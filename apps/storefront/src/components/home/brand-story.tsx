import type { HomepageSection } from '@nowoll/validation'
import Image from 'next/image'
import Link from 'next/link'

type Story = Extract<HomepageSection, { type: 'story' }>

/**
 * A few calm lines about the brand (design refresh 38f), on the soft beige
 * background, with an optional photo. Line breaks the admin types are kept
 * (`whitespace-pre-line`) — still plain text, never HTML.
 */
export function BrandStory({ section: s }: { section: Story }) {
  const headingId = `${s.id}-heading`
  return (
    <section aria-labelledby={headingId} className="bg-surface-muted">
      <div
        className={`mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:py-24 ${
          s.imageUrl ? 'md:grid-cols-[5fr_6fr] md:gap-16' : ''
        }`}
        data-reveal
      >
        {s.imageUrl && (
          <div className="relative aspect-[4/5] overflow-hidden">
            <Image
              src={s.imageUrl}
              alt={s.imageAlt ?? ''}
              fill
              sizes="(min-width: 768px) 45vw, 100vw"
              className="object-cover"
            />
          </div>
        )}
        <div
          className={`flex flex-col gap-5 ${s.imageUrl ? 'items-start' : 'mx-auto max-w-2xl items-center text-center'}`}
        >
          <h2 id={headingId} className="text-4xl leading-tight md:text-5xl">
            {s.heading}
          </h2>
          <p className="max-w-xl text-lg leading-relaxed whitespace-pre-line text-muted-foreground">
            {s.text}
          </p>
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
