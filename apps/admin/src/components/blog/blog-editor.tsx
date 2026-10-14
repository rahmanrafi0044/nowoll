'use client'

import type { AdminBlogDetail, AdminProductRow } from '@nowoll/types'
import { Badge, Button, Input, Markdown } from '@nowoll/ui'
import {
  BLOG_CONTENT_MAX,
  BLOG_MAX_PRODUCTS,
  blogInputSchema,
  blogPhotoSize,
  slugify,
} from '@nowoll/validation'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ImageField, SaveProblems } from '@/components/content/fields'
import { Panel } from '@/components/dashboard/panel'
import { imageFileProblem } from '@/components/product-edit/images-section'
import { useLoad } from '@/components/dashboard/use-load'
import { TextArea } from '@/components/form-fields'
import {
  archiveBlogPost,
  type BlogFields,
  createBlogPost,
  fetchBlogPost,
  updateBlogPost,
} from '@/lib/blog-api'
import { uploadContentImage } from '@/lib/content-api'
import { publicEnv } from '@/lib/env'
import { fetchProducts } from '@/lib/products-api'
import { postState } from './blog-labels'

// ============================================================================
// One blog post (step 43). Like the page editor: Markdown on the left, the
// shop's look on the right (the SAME <Markdown>). Checked here with the same
// rules as the API (blogInputSchema) before anything is sent. Photos inside
// the post come only from "Insert photo" (uploaded here, size included); the
// API refuses photos from other websites.
// ============================================================================

const FIELD_LABEL: Record<string, string> = {
  title: 'Title',
  slug: 'Web address',
  excerpt: 'Short summary',
  content: 'Text',
  coverImageAlt: 'Cover photo description',
  tags: 'Tags',
  seoTitle: 'Google title',
  seoDescription: 'Google description',
  productIds: 'Shop the look',
}

type Problem = { message: string; details?: string[] }
type PickedProduct = { id: string; name: string; imageUrl: string | null }

export function NewBlogPost() {
  return <BlogEditor initial={null} />
}

export function EditBlogPost({ id }: { id: string }) {
  const load = useCallback(() => fetchBlogPost(id), [id])
  const { state, retry } = useLoad(load)
  return (
    <Panel title="Post" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(post) => <BlogEditor initial={post} />}
    </Panel>
  )
}

/** ISO → the value a "date and time" box shows (the admin's own clock). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BlogEditor({ initial }: { initial: AdminBlogDetail | null }) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(initial !== null)
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [cover, setCover] = useState<string | null>(initial?.coverImageUrl ?? null)
  const [coverAlt, setCoverAlt] = useState(initial?.coverImageAlt ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? '')
  const [products, setProducts] = useState<PickedProduct[]>(
    (initial?.productIds ?? []).map((id) => ({ id, name: '…', imageUrl: null })),
  )
  const [when, setWhen] = useState(toLocalInput(initial?.publishedAt ?? null))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // The chosen products' names (the post only stores their ids).
  useEffect(() => {
    const unknown = products.filter((p) => p.name === '…')
    if (unknown.length === 0) return
    let live = true
    void fetchProducts({ status: 'all' }).then((r) => {
      if (!live || !r.ok) return
      setProducts((list) =>
        list.map((p) => {
          const row = r.data.items.find((x: AdminProductRow) => x.id === p.id)
          return row ? { id: row.id, name: row.name, imageUrl: row.image?.url ?? null } : p
        }),
      )
    })
    return () => {
      live = false
    }
  }, [products])

  const fields: BlogFields = {
    title,
    slug,
    excerpt: excerpt.trim() || null,
    content,
    coverImageUrl: cover,
    coverImageAlt: cover ? coverAlt.trim() || null : null,
    tags: tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    seoTitle: seoTitle.trim() || null,
    seoDescription: seoDescription.trim() || null,
    productIds: products.map((p) => p.id),
    publishedAt: when ? new Date(when).toISOString() : null,
  }
  const status = saved?.status ?? null
  const future = !!when && new Date(when) > new Date()

  function changeTitle(v: string) {
    setTitle(v)
    setDone(null)
    if (!slugTouched) setSlug(slugify(v).slice(0, 80).replace(/-+$/, ''))
  }

  async function submit(to: 'DRAFT' | 'PUBLISHED' | null, message: string) {
    const check = blogInputSchema.safeParse(fields)
    if (!check.success)
      return setProblem({
        message: 'Some fields need fixing:',
        details: check.error.issues.map(
          (i) => `${FIELD_LABEL[String(i.path[0])] ?? 'Post'}: ${i.message}`,
        ),
      })
    setBusy(true)
    setProblem(null)
    setDone(null)
    if (!saved) {
      const r = await createBlogPost({ ...fields, status: to ?? 'DRAFT' })
      setBusy(false)
      if (!r.ok) return setProblem({ message: r.message, details: r.details })
      return router.push(`/admin/content/blog/${r.data.id}`)
    }
    const r = await updateBlogPost(saved.id, { ...fields, ...(to && { status: to }) })
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setSaved(r.data)
    setWhen(toLocalInput(r.data.publishedAt))
    setDone(message)
  }

  async function archive() {
    if (!saved) return
    setConfirmArchive(false)
    setBusy(true)
    setDone(null)
    const r = await archiveBlogPost(saved.id)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setSaved(r.data)
    setDone('Archived — it leaves the shop within a minute. “Restore as draft” brings it back.')
  }

  const state = saved ? postState(saved) : null
  const publishLabel = future ? 'Schedule' : 'Publish'
  const publishMessage = future
    ? 'Scheduled — it appears on the shop at the chosen time.'
    : 'Published — on the shop within a minute.'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{saved ? saved.title : 'New post'}</h1>
        {state && <Badge variant={state.variant}>{state.label}</Badge>}
        {state?.label === 'Published' && (
          <a
            href={`${publicEnv.siteUrl}/blog/${saved!.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-4"
          >
            View on the shop
          </a>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Title"
          value={title}
          maxLength={120}
          onChange={(e) => changeTitle(e.target.value)}
        />
        <Input
          label="Web address"
          value={slug}
          maxLength={80}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
          hint={`At ${publicEnv.siteUrl.replace(/^https?:\/\//, '')}/blog/${slug || '…'}`}
        />
        <div className="sm:col-span-2">
          <TextArea
            label="Short summary"
            value={excerpt}
            maxLength={300}
            rows={2}
            onChange={(e) => setExcerpt(e.target.value)}
            hint="Shown on the blog page under the title. Empty = none."
          />
        </div>
        <ImageField
          label="Cover photo"
          url={cover}
          onChange={setCover}
          hint="Landscape, at least 1200 × 800 — the blog page and Facebook link previews use it."
        />
        {cover && (
          <Input
            label="Cover photo description"
            value={coverAlt}
            maxLength={200}
            onChange={(e) => setCoverAlt(e.target.value)}
            hint="What it shows, for people using screen readers — e.g. “Two men in white panjabis”."
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <ContentField value={content} onChange={setContent} />
          <FormatGuide />
        </div>
        <section aria-label="Preview" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Preview — how the shop shows it</span>
          <div className="min-h-96 rounded-control border border-border bg-surface p-5">
            <h2 className="mb-4 text-2xl font-semibold">{title || 'Title'}</h2>
            {content.trim() ? (
              <Markdown photo={previewPhoto}>{content}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Start writing on the left.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          hint="Separated by commas, e.g. eid, panjabi, summer-2026. Customers can click a tag to see similar posts."
        />
        <Input
          label="Publish date (optional)"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          hint="Empty = when you press Publish. A future time = scheduled: it appears by itself."
        />
      </div>

      <ProductPicker products={products} onChange={setProducts} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Google (optional)</legend>
        <Input
          label="Google title"
          value={seoTitle}
          maxLength={70}
          onChange={(e) => setSeoTitle(e.target.value)}
          hint="Empty = the post title."
        />
        <Input
          label="Google description"
          value={seoDescription}
          maxLength={160}
          onChange={(e) => setSeoDescription(e.target.value)}
          hint="Empty = the short summary."
        />
      </fieldset>

      <SaveProblems problem={problem} />
      <div className="flex flex-wrap items-center gap-3">
        {status === null || status === 'DRAFT' ? (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void submit(null, 'Draft saved — not on the shop yet.')}
            >
              Save draft
            </Button>
            <Button disabled={busy} onClick={() => void submit('PUBLISHED', publishMessage)}>
              {publishLabel}
            </Button>
          </>
        ) : status === 'PUBLISHED' ? (
          <>
            <Button
              disabled={busy}
              onClick={() => void submit(null, 'Saved. The shop shows it within a minute.')}
            >
              Save changes
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void submit('DRAFT', 'Unpublished — it leaves the shop within a minute.')
              }
            >
              Unpublish
            </Button>
          </>
        ) : (
          <Button
            disabled={busy}
            onClick={() => void submit('DRAFT', 'Restored as a draft — publish it when ready.')}
          >
            Restore as draft
          </Button>
        )}
        {(status === 'DRAFT' || status === 'PUBLISHED') && !confirmArchive && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmArchive(true)}>
            Archive
          </Button>
        )}
        {done && (
          <span role="status" className="text-sm text-success">
            {done}
          </span>
        )}
      </div>
      {confirmArchive && (
        <div
          role="group"
          aria-label="Confirm archiving the post"
          className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3 text-sm"
        >
          <span className="mr-auto">
            Archive this post? It leaves the shop. Nothing is deleted — you can restore it.
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
        href="/admin/content/blog"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← All posts
      </Link>
    </div>
  )
}

/** The preview shows photos from "Insert photo" (our uploads) like the shop does. */
function previewPhoto({ src, alt }: { src: string; alt: string }) {
  const photo = blogPhotoSize(src)
  const prefix = publicEnv.supabaseUrl?.replace(/\/+$/, '')
  if (!photo || !prefix || !photo.url.startsWith(`${prefix}/storage/v1/object/public/`)) return null
  return (
    <Image
      src={photo.url}
      alt={alt}
      width={photo.width}
      height={photo.height}
      sizes="600px"
      className="h-auto w-full rounded-control"
    />
  )
}

/** The text, with "Insert photo": uploads, then puts ![description](address#size) where the cursor is. */
function ContentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  // Where the cursor was when last in the text (null = never clicked in → add at the end).
  const cursor = useRef<number | null>(null)
  const remember = (e: { currentTarget: HTMLTextAreaElement }) => {
    cursor.current = e.currentTarget.selectionStart
  }
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function insert(file: File | undefined) {
    if (!file) return
    const p = imageFileProblem(file)
    if (p) return setProblem(p)
    setBusy(true)
    setProblem(null)
    const r = await uploadContentImage(file)
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
    if (!r.ok) return setProblem(r.message)
    const md = `\n\n![Describe the photo](${r.data.url}#w=${r.data.width}&h=${r.data.height})\n\n`
    const at = Math.min(cursor.current ?? value.length, value.length)
    onChange(`${value.slice(0, at)}${md}${value.slice(at)}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <TextArea
        label="Text"
        value={value}
        maxLength={BLOG_CONTENT_MAX}
        rows={22}
        className="min-h-96 font-mono text-sm"
        onChange={(e) => {
          remember(e)
          onChange(e.target.value)
        }}
        onSelect={remember}
        onClick={remember}
        onKeyUp={remember}
        hint="Markdown — see “How to format” below. After inserting a photo, replace “Describe the photo” with what it shows."
      />
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Photo to insert"
          onChange={(e) => void insert(e.target.files?.[0])}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? 'Uploading…' : 'Insert photo'}
        </Button>
        {problem && (
          <span role="alert" className="text-sm text-danger">
            {problem}
          </span>
        )}
      </div>
    </div>
  )
}

/** "Shop the look": up to 4 products, in order. */
function ProductPicker({
  products,
  onChange,
}: {
  products: PickedProduct[]
  onChange: (p: PickedProduct[]) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<AdminProductRow[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const full = products.length >= BLOG_MAX_PRODUCTS

  async function search(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    const r = await fetchProducts({ q: q.trim() || undefined, status: 'ACTIVE' })
    if (!r.ok) return setProblem(r.message)
    setResults(r.data.items)
  }
  const move = (i: number, by: -1 | 1) => {
    const next = [...products]
    const [p] = next.splice(i, 1)
    next.splice(i + by, 0, p!)
    onChange(next)
  }

  return (
    <section
      aria-label="Shop the look"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div>
        <h2 className="font-semibold">Shop the look (optional)</h2>
        <p className="text-sm text-muted-foreground">
          Up to {BLOG_MAX_PRODUCTS} products shown under the post. Products no longer on sale are
          left out by themselves.
        </p>
      </div>
      {products.length > 0 && (
        <ol aria-label="Chosen products" className="flex flex-col gap-2">
          {products.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-muted-foreground tabular-nums">{i + 1}.</span>
              <span className="mr-auto">{p.name}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move ${p.name} up`}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={i === products.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${p.name} down`}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(products.filter((x) => x.id !== p.id))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}
      {full ? (
        <p className="text-sm text-muted-foreground">
          That’s the most — remove one to add another.
        </p>
      ) : (
        <form
          onSubmit={(e) => void search(e)}
          className="flex flex-wrap items-end gap-2"
          role="search"
        >
          <div className="w-72">
            <Input label="Find a product" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Search
          </Button>
        </form>
      )}
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {!full && results && (
        <ul aria-label="Search results" className="flex flex-col gap-1 text-sm">
          {results.length === 0 && <li className="text-muted-foreground">No products found.</li>}
          {results.slice(0, 8).map((r) => {
            const chosen = products.some((p) => p.id === r.id)
            return (
              <li key={r.id} className="flex items-center gap-3">
                <span className="mr-auto">{r.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={chosen}
                  onClick={() =>
                    onChange([
                      ...products,
                      { id: r.id, name: r.name, imageUrl: r.image?.url ?? null },
                    ])
                  }
                >
                  {chosen ? 'Added' : 'Add'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const EXAMPLES: [string, string][] = [
  ['## Heading', 'A heading (### for a smaller one)'],
  ['**bold**  _italic_', 'Bold and italic words'],
  ['- item', 'A bullet list (1. for a numbered list)'],
  ['[See our panjabis](/shop/panjabi)', 'A link to a page on this shop'],
  ['> A quote', 'A quote, set off from the text'],
  ['(Insert photo button)', 'A photo — uploaded here, shown full width'],
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
        For safety, HTML code isn’t shown, photos must be added with “Insert photo”, and only links
        starting with /, https://, mailto: or tel: work.
      </p>
    </details>
  )
}
