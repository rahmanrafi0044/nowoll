'use client'

import type { AdminCategoryNode } from '@nowoll/types'
import { Button, Input, Markdown } from '@nowoll/ui'
import { categoryEditorialSchema, SLUG_PATTERN, slugify } from '@nowoll/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ImageField } from '@/components/content/fields'
import { SizeChartPicker } from '@/components/size-charts/size-chart-picker'
import { EditorialTiles, type TileForm, toTile, toTileForm } from './editorial-tiles'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { SelectField, TextArea } from '@/components/form-fields'
import {
  archiveCategory,
  type CategoryFields,
  createCategory,
  fetchCategoryTree,
  findCategory,
  updateCategory,
} from '@/lib/categories-api'
import { flattenCategories } from '@/lib/categories'
import { publicEnv } from '@/lib/env'
import { PHOTO_HINT } from '@/lib/photo-sizes'

// ============================================================================
// One category (step 36b): name, address, parent, picture, on/off, size
// guide (Markdown — tables, with a live preview), Google title/description.
// The API checks everything again (DTOs); these checks just answer sooner.
// ============================================================================

const SIZE_TABLE = `| Size | Chest (in) | Length (in) |
|---|---|---|
| S | 38 | 27 |
| M | 40 | 28 |
| L | 42 | 29 |
| XL | 44 | 30 |`

type Problem = { message: string; details?: string[]; productsLink?: boolean }

export function NewCategory() {
  const { state, retry } = useLoad(fetchCategoryTree)
  return (
    <Panel title="New category" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(tree) => <CategoryForm tree={tree} category={null} />}
    </Panel>
  )
}

export function EditCategory({ id }: { id: string }) {
  const { state, retry } = useLoad(fetchCategoryTree)
  return (
    <Panel title="Category" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(tree) => {
        const category = findCategory(tree, id)
        return category ? (
          <CategoryForm key={id} tree={tree} category={category} />
        ) : (
          <p className="text-sm text-muted-foreground">
            This category doesn’t exist (it may be archived).{' '}
            <Link href="/admin/categories/archived" className="underline">
              See archived categories
            </Link>
          </p>
        )
      }}
    </Panel>
  )
}

/** Ids of a category and everything inside it — it can't be moved into any of them. */
function selfAndDescendants(c: AdminCategoryNode): Set<string> {
  const ids = new Set([c.id])
  const walk = (n: AdminCategoryNode) => n.children.forEach((k) => (ids.add(k.id), walk(k)))
  walk(c)
  return ids
}

function parentOf(tree: AdminCategoryNode[], id: string | null) {
  return id ? findCategory(tree, id) : undefined
}

/** Is this category (or one of its parents) switched off? */
function hiddenAbove(tree: AdminCategoryNode[], parentId: string | null): string | null {
  let p = parentOf(tree, parentId)
  while (p) {
    if (!p.isActive) return p.name
    p = parentOf(tree, p.parentId)
  }
  return null
}

export function CategoryForm({
  tree,
  category,
}: {
  tree: AdminCategoryNode[]
  category: AdminCategoryNode | null
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(category)
  const [name, setName] = useState(category?.name ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  // A new category's address follows its name until edited by hand.
  const [slugTouched, setSlugTouched] = useState(category !== null)
  const [parentId, setParentId] = useState(category?.parentId ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [imageUrl, setImageUrl] = useState<string | null>(category?.imageUrl ?? null)
  const [imageAlt, setImageAlt] = useState(category?.imageAlt ?? '')
  const [isActive, setIsActive] = useState(category?.isActive ?? true)
  const [sizeGuide, setSizeGuide] = useState(category?.sizeGuide ?? '')
  const [sizeChartId, setSizeChartId] = useState(category?.sizeChartId ?? '')
  const [seoTitle, setSeoTitle] = useState(category?.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(category?.seoDescription ?? '')
  const [tiles, setTiles] = useState<TileForm[]>(() => (category?.editorial ?? []).map(toTileForm))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const fields: CategoryFields = {
    name: name.trim(),
    parentId: parentId || null,
    description: description.trim() || null,
    imageUrl,
    imageAlt: imageUrl ? imageAlt.trim() || null : null,
    sizeGuide: sizeGuide.trim() || null,
    sizeChartId: sizeChartId || null,
    isActive,
    seoTitle: seoTitle.trim() || null,
    seoDescription: seoDescription.trim() || null,
    editorial: tiles.map(toTile),
  }
  const base: CategoryFields | null = saved && {
    name: saved.name,
    parentId: saved.parentId,
    description: saved.description,
    imageUrl: saved.imageUrl,
    imageAlt: saved.imageAlt,
    sizeGuide: saved.sizeGuide,
    sizeChartId: saved.sizeChartId ?? null,
    isActive: saved.isActive,
    seoTitle: saved.seoTitle,
    seoDescription: saved.seoDescription,
    editorial: saved.editorial ?? [],
  }
  const dirty =
    saved === null
      ? name.trim() !== ''
      : JSON.stringify(fields) !== JSON.stringify(base) || slug !== saved.slug

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const blocked = saved ? selfAndDescendants(saved) : new Set<string>()
  const parents = flattenCategories(tree).filter((c) => !blocked.has(c.id))
  const hiddenParent = hiddenAbove(tree, parentId || null)
  const subCount = saved?.children.length ?? 0
  const slugChanged = saved !== null && slug !== saved.slug

  function changeName(v: string) {
    setName(v)
    setDone(null)
    if (!slugTouched) setSlug(slugify(v))
  }

  function check(): string[] {
    const p: string[] = []
    if (!fields.name) p.push('Name: write a name')
    if (slug && !SLUG_PATTERN.test(slug))
      p.push('Web address: use lowercase letters, numbers and single hyphens only')
    if (imageUrl && !fields.imageAlt) p.push('Describe the picture (for screen readers and Google)')
    // 38f photo tiles: the same rules the API checks with.
    const tilesCheck = categoryEditorialSchema.safeParse(fields.editorial)
    if (!tilesCheck.success)
      for (const issue of tilesCheck.error.issues)
        p.push(`Tile ${Number(issue.path[0]) + 1}: ${issue.message}`)
    return p
  }

  async function save() {
    const p = check()
    if (p.length) return setProblem({ message: 'Some fields need fixing:', details: p })
    setBusy(true)
    setProblem(null)
    setDone(null)
    if (!saved) {
      const r = await createCategory({ ...fields, ...(slug && { slug }) })
      setBusy(false)
      if (!r.ok) return setProblem({ message: r.message, details: r.details })
      return router.push(`/admin/categories/${r.data.id}`)
    }
    const r = await updateCategory(saved.id, { ...fields, ...(slugChanged && { slug }) })
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setSaved({ ...saved, ...fields, slug: r.data.slug })
    setDone('Saved. The shop shows it within a minute.')
  }

  async function archive() {
    if (!saved) return
    setConfirmArchive(false)
    setBusy(true)
    setProblem(null)
    const r = await archiveCategory(saved.id)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, productsLink: saved.productCount > 0 })
    router.push('/admin/categories')
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">{saved ? saved.name : 'New category'}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Name"
          value={name}
          maxLength={100}
          onChange={(e) => changeName(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <Input
            label="Web address"
            value={slug}
            maxLength={120}
            onChange={(e) => {
              setSlugTouched(true)
              setDone(null)
              setSlug(e.target.value)
            }}
            hint={`${publicEnv.siteUrl.replace(/^https?:\/\//, '')}/shop/${slug || '…'}${saved ? '' : ' — empty = made from the name'}`}
          />
          {slugChanged && saved.isActive && (
            <p className="text-sm text-warning">
              Old links to /shop/{saved.slug} will lead here automatically (a redirect is added —
              see Content → Redirects).
            </p>
          )}
        </div>
        <SelectField
          label="Inside"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          hint={saved ? 'It can’t go inside itself or its own subcategories.' : undefined}
        >
          <option value="">— Top level (in the main menu) —</option>
          {parents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 pt-7 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Show on the shop
          </label>
          {hiddenParent && (
            <p className="text-sm text-warning">
              “{hiddenParent}” is hidden, so customers won’t see this one either.
            </p>
          )}
          {!isActive && subCount > 0 && (
            <p className="text-sm text-muted-foreground">
              Hiding it also hides its {subCount} subcategor{subCount === 1 ? 'y' : 'ies'} and their
              products.
            </p>
          )}
        </div>
      </div>

      <TextArea
        label="Description (optional)"
        value={description}
        maxLength={5000}
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        hint="Shown at the top of the category page and to Google."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <ImageField
          label="Picture (optional)"
          url={imageUrl}
          onChange={setImageUrl}
          hint={PHOTO_HINT.category}
        />
        {imageUrl && (
          <Input
            label="Describe the picture"
            value={imageAlt}
            maxLength={200}
            onChange={(e) => setImageAlt(e.target.value)}
            hint="e.g. “Men’s panjabis on a rack”."
          />
        )}
      </div>

      <section aria-label="Size guide" className="flex flex-col gap-4">
        <div className="max-w-md">
          <SizeChartPicker
            value={sizeChartId}
            onChange={setSizeChartId}
            noneLabel="No size chart"
            hint="Every product in this category and its subcategories shows it — unless a subcategory or product has its own. On product pages it replaces the written guide below."
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <TextArea
              label="Size guide (optional)"
              value={sizeGuide}
              maxLength={20000}
              rows={10}
              className="font-mono text-sm"
              onChange={(e) => setSizeGuide(e.target.value)}
              hint="Shown on every product page in this category. A table works best."
            />
            {!sizeGuide.trim() && (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => setSizeGuide(SIZE_TABLE)}
              >
                Start with a table
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Preview — how product pages show it</span>
            <div className="min-h-40 rounded-control border border-border bg-surface p-4">
              {sizeGuide.trim() ? (
                <Markdown className="text-sm">{sizeGuide}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">No size guide.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <EditorialTiles tiles={tiles} onChange={setTiles} />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Google (optional)</legend>
        <Input
          label="Google title"
          value={seoTitle}
          maxLength={70}
          onChange={(e) => setSeoTitle(e.target.value)}
          hint="Empty = the category name."
        />
        <Input
          label="Google description"
          value={seoDescription}
          maxLength={160}
          onChange={(e) => setSeoDescription(e.target.value)}
          hint="Empty = the description."
        />
      </fieldset>

      {problem && (
        <div role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          <p className="font-medium">{problem.message}</p>
          {problem.details && problem.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {problem.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {problem.productsLink && saved && (
            <p className="mt-1">
              <Link href={`/admin/products?categoryId=${saved.id}`} className="underline">
                See its products
              </Link>{' '}
              — tick them all, then “Move to category…”.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || (saved !== null && !dirty)} onClick={() => void save()}>
          {busy ? 'Saving…' : saved ? 'Save changes' : 'Create category'}
        </Button>
        {saved && !confirmArchive && (
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
      {confirmArchive && saved && (
        <div
          role="group"
          aria-label="Confirm archiving the category"
          className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3 text-sm"
        >
          <span className="mr-auto">
            Archive {saved.name}? It leaves the shop. Nothing is deleted — you can restore it.
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
        href="/admin/categories"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← All categories
      </Link>
    </div>
  )
}
