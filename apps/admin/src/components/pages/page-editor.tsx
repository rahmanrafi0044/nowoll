'use client'

import type { AdminPageDetail } from '@nowoll/types'
import { Badge, Button, Input, Markdown } from '@nowoll/ui'
import { PAGE_CONTENT_MAX, pageInputSchema, slugify } from '@nowoll/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { SaveProblems } from '@/components/content/fields'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { TextArea } from '@/components/form-fields'
import { publicEnv } from '@/lib/env'
import { archivePage, createPage, fetchPage, type PageFields, updatePage } from '@/lib/pages-api'
import { PAGE_STATUS } from './page-labels'

// ============================================================================
// One page (step 36 part 2): Markdown on the left, the shop's look on the
// right (the SAME <Markdown> the shop uses). Checked here with the same rules
// as the API (pageInputSchema), so problems show before anything is sent.
// ============================================================================

const FIELD_LABEL: Record<string, string> = {
  title: 'Title',
  slug: 'Web address',
  content: 'Text',
  seoTitle: 'Google title',
  seoDescription: 'Google description',
}

type Problem = { message: string; details?: string[] }

export function NewPage() {
  return <PageEditor initial={null} />
}

export function EditPage({ id }: { id: string }) {
  const load = useCallback(() => fetchPage(id), [id])
  const { state, retry } = useLoad(load)
  return (
    <Panel title="Page" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(page) => <PageEditor initial={page} />}
    </Panel>
  )
}

export function PageEditor({ initial }: { initial: AdminPageDetail | null }) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  // A new page's address follows its title until the address is edited by hand.
  const [slugTouched, setSlugTouched] = useState(initial !== null)
  const [content, setContent] = useState(initial?.content ?? '')
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const fields: PageFields = {
    title,
    slug,
    content,
    seoTitle: seoTitle.trim() || null,
    seoDescription: seoDescription.trim() || null,
  }
  const base: PageFields = saved
    ? {
        title: saved.title,
        slug: saved.slug,
        content: saved.content,
        seoTitle: saved.seoTitle,
        seoDescription: saved.seoDescription,
      }
    : { title: '', slug: '', content: '', seoTitle: null, seoDescription: null }
  const dirty = JSON.stringify(fields) !== JSON.stringify(base)
  const status = saved?.status ?? null

  // "Leave site? Changes you made may not be saved."
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function changeTitle(v: string) {
    setTitle(v)
    setDone(null)
    if (!slugTouched) setSlug(slugify(v).slice(0, 60).replace(/-+$/, ''))
  }

  /** Saves the fields; `to` also publishes / unpublishes / restores. */
  async function submit(to: 'DRAFT' | 'PUBLISHED' | null, message: string) {
    const check = pageInputSchema.safeParse(fields)
    if (!check.success)
      return setProblem({
        message: 'Some fields need fixing:',
        details: check.error.issues.map(
          (i) => `${FIELD_LABEL[String(i.path[0])] ?? 'Page'}: ${i.message}`,
        ),
      })
    setBusy(true)
    setProblem(null)
    setDone(null)
    if (!saved) {
      const r = await createPage({ ...fields, status: to ?? 'DRAFT' })
      setBusy(false)
      if (!r.ok) return setProblem({ message: r.message, details: r.details })
      return router.push(`/admin/content/pages/${r.data.id}`)
    }
    const r = await updatePage(saved.id, { ...fields, ...(to && { status: to }) })
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setSaved(r.data)
    setDone(message)
  }

  async function archive() {
    if (!saved) return
    setConfirmArchive(false)
    setBusy(true)
    setProblem(null)
    setDone(null)
    const r = await archivePage(saved.id)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setSaved(r.data)
    setDone('Archived — it leaves the shop within a minute. “Restore as draft” brings it back.')
  }

  const slugChanged = status === 'PUBLISHED' && saved !== null && slug !== saved.slug

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{saved ? saved.title : 'New page'}</h1>
        {status && <Badge variant={PAGE_STATUS[status].variant}>{PAGE_STATUS[status].label}</Badge>}
        {status === 'PUBLISHED' && (
          <a
            href={`${publicEnv.siteUrl}/${saved!.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-4"
          >
            View on the shop
          </a>
        )}
      </div>
      {status === 'ARCHIVED' && (
        <p className="rounded-control bg-warning-soft p-3 text-sm text-warning">
          Archived — not on the shop. “Restore as draft” brings it back.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Title"
          value={title}
          maxLength={80}
          onChange={(e) => changeTitle(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <Input
            label="Web address"
            value={slug}
            maxLength={60}
            onChange={(e) => {
              setSlugTouched(true)
              setDone(null)
              setSlug(e.target.value)
            }}
            hint={`The page will be at ${publicEnv.siteUrl.replace(/^https?:\/\//, '')}/${slug || '…'}`}
          />
          {slugChanged && (
            <p className="text-sm text-warning">
              Old links to /{saved!.slug} will lead here automatically (a redirect is added — see
              Content → Redirects).
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <TextArea
            label="Text"
            value={content}
            maxLength={PAGE_CONTENT_MAX}
            rows={22}
            className="min-h-96 font-mono text-sm"
            onChange={(e) => {
              setDone(null)
              setContent(e.target.value)
            }}
            hint="Markdown — see “How to format” below."
          />
          <FormatGuide />
        </div>
        <section aria-label="Preview" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Preview — how the shop shows it</span>
          <div className="min-h-96 rounded-control border border-border bg-surface p-5">
            <h2 className="mb-4 text-2xl font-semibold">{title || 'Title'}</h2>
            {content.trim() ? (
              <Markdown>{content}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Start writing on the left.</p>
            )}
          </div>
        </section>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Google (optional)</legend>
        <Input
          label="Google title"
          value={seoTitle}
          maxLength={70}
          onChange={(e) => setSeoTitle(e.target.value)}
          hint="Empty = the page title."
        />
        <Input
          label="Google description"
          value={seoDescription}
          maxLength={160}
          onChange={(e) => setSeoDescription(e.target.value)}
          hint="Empty = the first words of the text."
        />
      </fieldset>

      <SaveProblems problem={problem} />
      <div className="flex flex-wrap items-center gap-3">
        {status === null || status === 'DRAFT' ? (
          <>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => void submit(null, 'Draft saved — not on the shop yet.')}
            >
              Save draft
            </Button>
            <Button
              disabled={busy}
              onClick={() => void submit('PUBLISHED', 'Published — on the shop within a minute.')}
            >
              Publish
            </Button>
          </>
        ) : status === 'PUBLISHED' ? (
          <>
            <Button
              disabled={busy || !dirty}
              onClick={() => void submit(null, 'Saved. The shop shows it within a minute.')}
            >
              Save changes
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() =>
                void submit('DRAFT', 'Unpublished — it leaves the shop within a minute.')
              }
            >
              Unpublish
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={busy || !dirty}
              variant="secondary"
              onClick={() => void submit(null, 'Saved (still archived).')}
            >
              Save changes
            </Button>
            <Button
              disabled={busy}
              onClick={() => void submit('DRAFT', 'Restored as a draft — publish it when ready.')}
            >
              Restore as draft
            </Button>
          </>
        )}
        {(status === 'DRAFT' || status === 'PUBLISHED') && !confirmArchive && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmArchive(true)}>
            Archive
          </Button>
        )}
        {dirty && <span className="text-sm text-warning">Unsaved changes</span>}
        {done && (
          <span role="status" className="text-sm text-success">
            {done}
          </span>
        )}
      </div>
      {confirmArchive && (
        <div
          role="group"
          aria-label="Confirm archiving the page"
          className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3 text-sm"
        >
          <span className="mr-auto">
            Archive this page? It leaves the shop and the footer. Nothing is deleted — you can
            restore it.
          </span>
          <Button variant="secondary" size="sm" onClick={() => setConfirmArchive(false)}>
            Keep it
          </Button>
          <Button size="sm" onClick={() => void archive()}>
            Yes, archive
          </Button>
        </div>
      )}
      <Link
        href="/admin/content/pages"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← All pages
      </Link>
    </div>
  )
}

const EXAMPLES: [string, string][] = [
  ['## Heading', 'A heading (### for a smaller one)'],
  ['**bold**  _italic_', 'Bold and italic words'],
  ['- item', 'A bullet list (1. for a numbered list)'],
  ['[Track your order](/orders/track)', 'A link to a page on this shop'],
  ['[WhatsApp](https://wa.me/8801…)', 'A link to another website (opens in a new tab)'],
  ['[Email us](mailto:hi@nowoll.com)', 'An email link (tel:+880… for a phone link)'],
  ['| Size | Chest |\n|---|---|\n| M | 40 |', 'A table'],
  ['(an empty line)', 'Starts a new paragraph'],
]

function FormatGuide() {
  return (
    <details className="rounded-control border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">How to format the text</summary>
      <table className="mt-3 w-full">
        <tbody>
          {EXAMPLES.map(([write, result]) => (
            <tr key={write} className="border-t border-border align-top">
              <td className="py-1.5 pr-3 font-mono text-xs whitespace-pre-wrap">{write}</td>
              <td className="py-1.5 text-muted-foreground">{result}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        For safety, HTML code and pictures aren’t shown, and only links starting with /, https://,
        mailto: or tel: work.
      </p>
    </details>
  )
}
