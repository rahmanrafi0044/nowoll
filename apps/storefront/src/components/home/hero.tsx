import type { HomepageHero } from '@nowoll/validation'
import Image from 'next/image'
import Link from 'next/link'

// The big first section. Content comes from the "homepage_hero" content block,
// so the heading, button and photo can be changed without a developer.
export function Hero({ data }: { data: HomepageHero }) {
  return (
    <section className="relative isolate overflow-hidden bg-surface-muted">
      {data.imageUrl && (
        <>
          <Image
            src={data.imageUrl}
            alt={data.imageAlt ?? ''}
            fill
            priority // the hero is the largest thing on screen → load it first
            sizes="100vw"
            className="-z-10 object-cover"
          />
          {/* Darkens the photo so white text stays readable on any image */}
          <div className="absolute inset-0 -z-10 bg-black/40" aria-hidden="true" />
        </>
      )}
      <div
        className={`mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 py-20 sm:py-28 ${data.imageUrl ? 'text-white' : 'text-foreground'}`}
      >
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-6xl">
          {data.heading}
        </h1>
        {data.subheading && <p className="max-w-xl text-lg opacity-90">{data.subheading}</p>}
        <Link
          href={data.ctaHref}
          className="mt-2 inline-flex h-12 items-center rounded-control bg-brand px-6 text-base font-medium text-brand-foreground hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {data.ctaLabel}
        </Link>
      </div>
    </section>
  )
}
