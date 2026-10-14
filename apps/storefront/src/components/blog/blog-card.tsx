import type { BlogCardView } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'
import { postDate } from '@/lib/blog'

/** One post on /blog: cover, date, title, excerpt. */
export function BlogCard({ post, priority = false }: { post: BlogCardView; priority?: boolean }) {
  return (
    <article className="group flex flex-col gap-3">
      <Link href={`/blog/${post.slug}`} className="flex flex-col gap-3">
        <div className="relative aspect-[3/2] overflow-hidden rounded-control bg-surface-muted">
          {post.coverImageUrl && (
            <Image
              src={post.coverImageUrl}
              alt={post.coverImageAlt ?? ''}
              fill
              priority={priority}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform group-hover:scale-[1.02]"
            />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time>
        </p>
        <h2 className="text-lg font-semibold group-hover:underline">{post.title}</h2>
      </Link>
      {post.excerpt && <p className="text-muted-foreground">{post.excerpt}</p>}
    </article>
  )
}
