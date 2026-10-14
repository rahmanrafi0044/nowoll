import Image from 'next/image'
import { ownPhoto } from '@/lib/blog'

/**
 * A photo inside a blog post (step 43): only the shop's own uploads, shown
 * through next/image at their real size (no jumping page, smaller files).
 * Anything else → null, so only its description is shown.
 */
export function blogPhoto({ src, alt }: { src: string; alt: string }) {
  const photo = ownPhoto(src)
  if (!photo) return null
  return (
    <figure>
      <Image
        src={photo.url}
        alt={alt}
        width={photo.width}
        height={photo.height}
        sizes="(min-width: 768px) 720px, 100vw"
        className="h-auto w-full rounded-control"
      />
      {alt && <figcaption className="mt-2 text-sm text-muted-foreground">{alt}</figcaption>}
    </figure>
  )
}
