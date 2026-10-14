'use client'

import { Badge } from '@nowoll/ui'
import Link from 'next/link'
import { useCallback } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { fetchBlogPosts } from '@/lib/blog-api'
import { formatInstantDateTime } from '@/lib/date'
import { publicEnv } from '@/lib/env'
import { postState } from './blog-labels'

// Admin → Content → Blog (step 43): drafts, scheduled and published posts —
// or the archive. Writing posts is Staff work too (step 38e).
export function BlogList({ archived }: { archived: boolean }) {
  const load = useCallback(() => fetchBlogPosts(archived ? 'ARCHIVED' : undefined), [archived])
  const { state, retry } = useLoad(load)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Blog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stories, styling ideas and new arrivals, at{' '}
            <a
              href={`${publicEnv.siteUrl}/blog`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              /blog
            </a>
            . A post can be published now or on a date you choose.
          </p>
        </div>
        <Link
          href="/admin/content/blog/new"
          className="inline-flex h-11 items-center rounded-control px-5 text-sm font-medium bg-brand text-brand-foreground hover:bg-brand-hover"
        >
          New post
        </Link>
      </div>
      <nav aria-label="Which posts" className="flex gap-4 text-sm">
        <Link
          href="/admin/content/blog"
          aria-current={!archived ? 'page' : undefined}
          className={!archived ? 'font-semibold' : 'text-muted-foreground hover:underline'}
        >
          Posts
        </Link>
        <Link
          href="/admin/content/blog?archived=1"
          aria-current={archived ? 'page' : undefined}
          className={archived ? 'font-semibold' : 'text-muted-foreground hover:underline'}
        >
          Archive
        </Link>
      </nav>
      <Panel title={archived ? 'Archived posts' : 'Posts'} state={state} retry={retry}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {archived ? 'Nothing archived.' : 'No posts yet — write the first one.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 font-medium">Title</th>
                  <th className="py-1.5 font-medium">State</th>
                  <th className="py-1.5 font-medium">Publish date</th>
                  <th className="py-1.5 font-medium">Last changed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const st = postState(p)
                  return (
                    <tr key={p.id} className="border-b border-border">
                      <td className="py-1.5 pr-3">
                        <Link href={`/admin/content/blog/${p.id}`} className="hover:underline">
                          {p.title}
                        </Link>
                        <span className="block text-xs text-muted-foreground">/blog/{p.slug}</span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {p.publishedAt ? formatInstantDateTime(p.publishedAt) : '—'}
                      </td>
                      <td className="py-1.5 text-muted-foreground">
                        {formatInstantDateTime(p.updatedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        }
      </Panel>
    </div>
  )
}
