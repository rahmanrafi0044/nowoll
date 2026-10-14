import type { BlogPostView, BlogSitemapEntry } from '@nowoll/types'
import { Markdown } from '@nowoll/ui'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { blogPhoto } from '@/components/blog/blog-photo'
import { ProductCard } from '@/components/product-card'
import { apiGet } from '@/lib/api'
import { blogPostingJsonLd, postDate, postSummary } from '@/lib/blog'
import { breadcrumbJsonLd, JsonLd } from '@/lib/json-ld'
import { getSettings } from '@/lib/settings'

// /blog/<slug> — one post (step 43). Built ahead for every live post and
// refreshed every minute (ISR), so a new or edited post shows within a minute.

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 60

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const posts = await apiGet<BlogSitemapEntry[]>('/blog/sitemap')
  return (posts ?? []).map((p) => ({ slug: p.slug }))
}

const getPost = cache((slug: string) => apiGet<BlogPostView>(`/blog/${encodeURIComponent(slug)}`))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug)
  if (!post) return { title: 'Post not found' }
  return {
    title: post.seoTitle ?? post.title,
    description: postSummary(post),
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.seoTitle ?? post.title,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      ...(post.coverImageUrl && {
        images: [{ url: post.coverImageUrl, alt: post.coverImageAlt ?? post.title }],
      }),
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const [post, settings] = await Promise.all([getPost((await params).slug), getSettings()])
  if (!post) notFound() // draft, scheduled, archived or unknown → 404

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={blogPostingJsonLd(post, settings.store_name)} />
      <JsonLd
        data={breadcrumbJsonLd(
          [],
          [
            { name: 'Blog', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ],
        )}
      />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/blog" className="hover:underline">
          ← Blog
        </Link>
      </nav>
      <header className="mb-8 flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="text-sm text-muted-foreground">
          <time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time> ·{' '}
          {settings.store_name}
        </p>
        {post.tags.length > 0 && (
          <ul aria-label="Tags" className="flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <li key={t}>
                <Link
                  href={`/blog?tag=${encodeURIComponent(t)}`}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-muted"
                >
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </header>
      {post.coverImageUrl && (
        <div className="relative mb-8 aspect-[3/2] overflow-hidden rounded-control bg-surface-muted">
          <Image
            src={post.coverImageUrl}
            alt={post.coverImageAlt ?? ''}
            fill
            priority
            sizes="(min-width: 768px) 720px, 100vw"
            className="object-cover"
          />
        </div>
      )}
      <Markdown photo={blogPhoto}>{post.content}</Markdown>

      {post.products.length > 0 && (
        <section aria-labelledby="shop-the-look" className="mt-12 border-t border-border pt-8">
          <h2 id="shop-the-look" className="mb-6 text-xl font-semibold">
            Shop the look
          </h2>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {post.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
