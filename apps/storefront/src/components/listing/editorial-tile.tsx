import type { EditorialTileView } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'

/**
 * A photo tile among a category's products (Admin → Categories, design refresh
 * 38f) — the "asymmetric" look: a wide tile spans two columns. The words sit on
 * a dark gradient so they stay readable on any photo (WCAG contrast). With a
 * link, the whole tile is one link named by its heading.
 */
export function EditorialTile({
  tile,
  priority = false,
}: {
  tile: EditorialTileView
  priority?: boolean
}) {
  const body = (
    <>
      <Image
        src={tile.imageUrl}
        alt={tile.imageAlt}
        fill
        priority={priority}
        sizes={tile.wide ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1024px) 25vw, 50vw'}
        className="object-cover transition-transform duration-1000 ease-(--ease-out-soft) group-hover:scale-[1.03] motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
      />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 text-white md:p-7">
        <span className="font-display text-2xl leading-tight md:text-3xl">{tile.heading}</span>
        {tile.text && <span className="max-w-sm text-sm text-white/90">{tile.text}</span>}
        {tile.href && (
          <span className="mt-1 inline-flex items-center gap-2 text-xs font-medium">
            <span className="underline underline-offset-4">Shop now</span>
          </span>
        )}
      </span>
    </>
  )
  const frame =
    'group relative block h-full min-h-[22rem] overflow-hidden bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand'
  return tile.href ? (
    <Link href={tile.href} className={frame}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  )
}
