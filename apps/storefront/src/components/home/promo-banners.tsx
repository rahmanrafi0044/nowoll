import type { HomepageSection } from '@nowoll/validation'
import Image from 'next/image'
import Link from 'next/link'

type Banners = Extract<HomepageSection, { type: 'banners' }>['banners']

/**
 * 1–3 picture banners from the admin's homepage builder (step 36). Each can
 * carry a short line of text and a link (an internal path or https — checked
 * by the API). No link = a plain picture.
 */
export function PromoBanners({ id, banners }: { id: string; banners: Banners }) {
  const cols =
    banners.length === 1 ? '' : banners.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
  return (
    <section aria-label="Promotions" id={id} className="mx-auto max-w-7xl px-4 py-8">
      <ul className={`grid grid-cols-1 gap-4 ${cols}`}>
        {banners.map((b, i) => {
          const picture = (
            <span className="relative block aspect-[16/9] overflow-hidden rounded-control bg-surface-muted">
              <Image
                src={b.imageUrl}
                alt={b.imageAlt}
                fill
                sizes={banners.length === 1 ? '100vw' : '(min-width: 640px) 33vw, 100vw'}
                className="object-cover"
              />
              {b.text && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-lg font-semibold text-white">
                  {b.text}
                </span>
              )}
            </span>
          )
          return (
            <li key={`${b.imageUrl}-${i}`}>
              {b.href ? (
                <Link
                  href={b.href}
                  className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {picture}
                </Link>
              ) : (
                picture
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
