import Image from 'next/image'
import { publicEnv } from '@/lib/env'

/**
 * A product's first photo, small. Real photos are full Supabase Storage
 * addresses (resized by next/image — a 48px thumbnail never downloads the
 * full photo). The local demo products (pnpm db:seed:demo) use "/demo/…"
 * paths that the SHOP serves, so those load from the shop's address as-is.
 */
export function ProductThumb({ image }: { image: { url: string; altText: string } | null }) {
  if (!image)
    return (
      <span className="flex size-12 items-center justify-center rounded-control bg-surface-muted text-[10px] text-muted-foreground">
        No photo
      </span>
    )
  const demo = image.url.startsWith('/')
  return (
    <Image
      src={demo ? `${publicEnv.siteUrl}${image.url}` : image.url}
      alt={image.altText}
      width={48}
      height={48}
      unoptimized={demo}
      className="size-12 rounded-control bg-surface-muted object-cover"
    />
  )
}
