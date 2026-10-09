'use client'

import { Badge, Button } from '@nowoll/ui'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { formatInstantDate } from '@/lib/date'
import { publicEnv } from '@/lib/env'
import { addStarterPages, fetchPages } from '@/lib/pages-api'
import { PAGE_STATUS } from './page-labels'

const link = 'inline-flex h-11 items-center rounded-control px-5 text-sm font-medium'

/** Admin → Content → Pages: drafts and published, or the archive. */
export function PageList({ archived }: { archived: boolean }) {
  const load = useCallback(() => fetchPages(archived ? 'ARCHIVED' : undefined), [archived])
  const { state, retry, refresh } = useLoad(load)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function starters() {
    setBusy(true)
    setNote(null)
    const r = await addStarterPages()
    setBusy(false)
    if (!r.ok) return setNote({ ok: false, text: r.message })
    const n = r.data.created.length
    setNote({
      ok: true,
      text:
        n === 0
          ? 'All six starter pages are already here (or archived) — nothing added.'
          : `Added ${n} starter page${n === 1 ? '' : 's'} as drafts. Fill in the [fill in] parts, then publish.`,
    })
    refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Pages</h1>
        <div className="flex flex-wrap gap-2">
          {!archived && (
            <Button variant="secondary" disabled={busy} onClick={() => void starters()}>
              {busy ? 'Adding…' : 'Add starter pages'}
            </Button>
          )}
          <Link
            href="/admin/content/pages/new"
            className={`${link} bg-brand text-brand-foreground hover:bg-brand-hover`}
          >
            New page
          </Link>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Privacy, terms, return policy, about, FAQ… Published pages appear in the shop’s footer.
        {!archived &&
          ' Starter pages are templates, not legal advice — have the legal ones checked.'}
      </p>
      {note && (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={`text-sm ${note.ok ? 'text-success' : 'text-danger'}`}
        >
          {note.text}
        </p>
      )}
      <nav aria-label="Which pages" className="flex gap-4 text-sm">
        <Link
          href="/admin/content/pages"
          aria-current={archived ? undefined : 'page'}
          className={archived ? 'text-muted-foreground hover:underline' : 'font-semibold'}
        >
          Drafts and published
        </Link>
        <Link
          href="/admin/content/pages?archived=1"
          aria-current={archived ? 'page' : undefined}
          className={archived ? 'font-semibold' : 'text-muted-foreground hover:underline'}
        >
          Archived
        </Link>
      </nav>
      <Panel title={archived ? 'Archived pages' : 'Pages'} state={state} retry={retry}>
        {(pages) =>
          pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {archived
                ? 'Nothing archived.'
                : 'No pages yet. “Add starter pages” gives you six drafts to fill in.'}
            </p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 font-medium">Title</th>
                    <th className="py-2 font-medium">Address</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Last changed</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => (
                    <tr key={p.id} className="border-b border-border">
                      <td className="py-2.5">
                        <Link
                          href={`/admin/content/pages/${p.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {p.title}
                        </Link>
                      </td>
                      <td className="py-2.5 font-mono text-xs">
                        {p.status === 'PUBLISHED' ? (
                          <a
                            href={`${publicEnv.siteUrl}/${p.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-4"
                          >
                            /{p.slug}
                          </a>
                        ) : (
                          `/${p.slug}`
                        )}
                      </td>
                      <td className="py-2.5">
                        <Badge variant={PAGE_STATUS[p.status].variant}>
                          {PAGE_STATUS[p.status].label}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {formatInstantDate(p.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Panel>
    </div>
  )
}
