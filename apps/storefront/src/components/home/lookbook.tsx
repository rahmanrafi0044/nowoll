import type { HomepageSection } from '@nowoll/validation'
import Image from 'next/image'
import Link from 'next/link'

type Lookbook = Extract<HomepageSection, { type: 'lookbook' }>

/**
 * "Spotted" (38f): photos of people wearing the brand, each optionally linking
 * to what they wear. Phones: a row you swipe through (each photo snaps into
 * place); computers: 4 across. The row scrolls inside its own box — never the
 * page — and that box can take keyboard focus, so it can be scrolled with the
 * arrow keys too.
 */
export function LookbookSection({ section: s }: { section: Lookbook }) {
  const headingId = `${s.id}-heading`
  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-7xl py-12 md:py-16">
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <h2 id={headingId} className="text-3xl md:text-4xl">
          {s.title ?? 'Spotted in Nowoll'}
        </h2>
        {s.text && <p className="max-w-xl text-muted-foreground">{s.text}</p>}
      </div>
      <div
        role="region"
        aria-label={`${s.title ?? 'Spotted in Nowoll'} photos`}
        tabIndex={0}
        className="mt-8 overflow-x-auto px-4 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-brand md:overflow-visible"
      >
        <ul className="flex snap-x snap-mandatory gap-3 md:grid md:grid-cols-4 md:gap-4">
          {s.items.map((item, i) => {
            const photo = (
              <span className="relative block aspect-[4/5] overflow-hidden bg-surface-muted">
                <Image
                  src={item.imageUrl}
                  alt={item.imageAlt}
                  fill
                  sizes="(min-width: 768px) 25vw, 70vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none"
                />
              </span>
            )
            return (
              <li
                key={`${item.imageUrl}-${i}`}
                className="w-[70%] shrink-0 snap-start sm:w-[40%] md:w-auto"
                data-reveal
                style={{ '--reveal-order': i % 4 } as React.CSSProperties}
              >
                {item.href ? (
                  <Link
                    href={item.href}
                    className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {photo}
                    {item.caption && (
                      <span className="mt-2 block text-sm group-hover:underline group-hover:underline-offset-4">
                        {item.caption}
                      </span>
                    )}
                  </Link>
                ) : (
                  <figure className="group">
                    {photo}
                    {item.caption && (
                      <figcaption className="mt-2 text-sm">{item.caption}</figcaption>
                    )}
                  </figure>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
