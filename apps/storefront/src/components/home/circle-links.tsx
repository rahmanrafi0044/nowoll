import type { HomepageSection } from '@nowoll/validation'
import Image from 'next/image'
import Link from 'next/link'

type Circles = Extract<HomepageSection, { type: 'circles' }>

/**
 * Round photos with one word each — "Eid", "Office", "Lawn" (design refresh
 * 38f). Each links anywhere in the shop. Phones fit 4 in a row; more wrap
 * onto a second line instead of scrolling sideways.
 */
export function CircleLinks({ section: s }: { section: Circles }) {
  const headingId = `${s.id}-heading`
  return (
    <section
      aria-labelledby={s.title ? headingId : undefined}
      aria-label={s.title ? undefined : 'Shop by occasion'}
      className="mx-auto max-w-7xl px-4 py-12"
    >
      {s.title && (
        <h2 id={headingId} className="text-center text-3xl md:text-4xl">
          {s.title}
        </h2>
      )}
      <ul className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-8 sm:gap-x-10">
        {s.items.map((item, i) => (
          <li
            key={`${item.href}-${i}`}
            data-reveal
            style={{ '--reveal-order': i } as React.CSSProperties}
          >
            <Link
              href={item.href}
              className="group flex w-[4.5rem] flex-col items-center gap-3 text-center text-sm focus-visible:outline-none sm:w-32"
            >
              <span className="relative block size-[4.5rem] overflow-hidden rounded-full bg-surface-muted ring-offset-4 ring-offset-surface group-hover:ring-1 group-hover:ring-border-strong group-focus-visible:ring-2 group-focus-visible:ring-brand sm:size-32">
                <Image
                  src={item.imageUrl}
                  alt={item.imageAlt}
                  fill
                  sizes="128px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
                />
              </span>
              <span className="group-hover:underline group-hover:underline-offset-4">
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
