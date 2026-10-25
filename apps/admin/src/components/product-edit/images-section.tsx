'use client'

import type { AdminImage, AdminProductDetail } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useState } from 'react'
import { FormProblem, SelectField } from '@/components/form-fields'
import { ProductThumb } from '@/components/products/product-thumb'
import { deleteImage, updateImage, uploadImage } from '@/lib/products-api'
import { PHOTO_HINT } from '@/lib/photo-sizes'

// ============================================================================
// Photos. The first one is the main photo (product cards, Google, social
// shares). Order is changed with "Move earlier / later" buttons — they work
// from the keyboard too, unlike drag-and-drop.
// The same limits as the API (CLAUDE.md §11.7) are checked here first, so a
// wrong file is refused at once instead of after a slow upload.
// ============================================================================

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** null = fine; otherwise why this file can't be used. */
export function imageFileProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a JPEG, PNG or WebP photo.'
  if (file.size > MAX_IMAGE_BYTES)
    return `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`
  return null
}

/**
 * The new sortOrder of every image after moving one: positions 0, 1, 2…
 * Only the images whose number actually changes are returned (to save).
 */
export function reorder(images: AdminImage[], index: number, by: -1 | 1) {
  const order = [...images]
  const [moved] = order.splice(index, 1)
  order.splice(index + by, 0, moved!)
  return order
    .map((img, position) => ({ id: img.id, sortOrder: position, before: img.sortOrder }))
    .filter((x) => x.sortOrder !== x.before)
}

export function ImagesSection({
  product,
  readOnly,
  onChanged,
}: {
  product: AdminProductDetail
  readOnly: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function move(index: number, by: -1 | 1) {
    setBusy(true)
    setProblem(null)
    for (const change of reorder(product.images, index, by)) {
      const r = await updateImage(product.id, change.id, { sortOrder: change.sortOrder })
      if (!r.ok) {
        setProblem(r.message)
        break
      }
    }
    setBusy(false)
    onChanged()
  }

  return (
    <div className="flex flex-col gap-6">
      {product.images.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No photos yet. A product needs at least one photo to go live.
        </p>
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {product.images.map((img, i) => (
            <ImageCard
              key={`${img.id}:${img.altText}:${img.variantId}:${img.sortOrder}`}
              image={img}
              position={i}
              count={product.images.length}
              product={product}
              readOnly={readOnly}
              busy={busy}
              onMove={(by) => move(i, by)}
              onChanged={onChanged}
            />
          ))}
        </ol>
      )}
      <FormProblem message={problem} />
      {!readOnly && <UploadForm product={product} onUploaded={onChanged} />}
    </div>
  )
}

function variantOptions(product: AdminProductDetail) {
  return product.variants.map((v) => ({ id: v.id, label: `${v.color} / ${v.size}` }))
}

function ImageCard({
  image,
  position,
  count,
  product,
  readOnly,
  busy,
  onMove,
  onChanged,
}: {
  image: AdminImage
  position: number
  count: number
  product: AdminProductDetail
  readOnly: boolean
  busy: boolean
  onMove: (by: -1 | 1) => void
  onChanged: () => void
}) {
  const [altText, setAltText] = useState(image.altText)
  const [variantId, setVariantId] = useState(image.variantId ?? '')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dirty = altText !== image.altText || variantId !== (image.variantId ?? '')
  const name = position === 0 ? 'Main photo' : `Photo ${position + 1}`

  async function run(request: Promise<{ ok: boolean; message?: string }>) {
    setSaving(true)
    setProblem(null)
    const r = await request
    setSaving(false)
    if (!r.ok) {
      setConfirmDelete(false)
      return setProblem(r.message ?? 'Something went wrong.')
    }
    onChanged()
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        <ProductThumb image={image} />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <fieldset disabled={readOnly || saving} className="flex flex-col gap-3">
        <legend className="sr-only">{name}</legend>
        <Input
          label="Alt text"
          value={altText}
          maxLength={200}
          onChange={(e) => setAltText(e.target.value)}
        />
        <SelectField
          label="Shows colour/size"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
        >
          <option value="">All of them</option>
          {variantOptions(product).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </SelectField>
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {dirty && (
            <Button
              size="sm"
              disabled={saving || !altText.trim()}
              onClick={() =>
                run(
                  updateImage(product.id, image.id, {
                    altText: altText.trim(),
                    variantId: variantId || null,
                  }),
                )
              }
            >
              Save
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || position === 0}
            aria-label={`Move ${name.toLowerCase()} earlier`}
            onClick={() => onMove(-1)}
          >
            ← Earlier
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || position === count - 1}
            aria-label={`Move ${name.toLowerCase()} later`}
            onClick={() => onMove(1)}
          >
            Later →
          </Button>
          {confirmDelete ? (
            <>
              <Button
                size="sm"
                variant="danger"
                disabled={saving}
                onClick={() => run(deleteImage(product.id, image.id))}
              >
                Delete {name.toLowerCase()}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete…
            </Button>
          )}
        </div>
      )}
      <FormProblem message={problem} />
    </li>
  )
}

function UploadForm({
  product,
  onUploaded,
}: {
  product: AdminProductDetail
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [altText, setAltText] = useState('')
  const [variantId, setVariantId] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0) // a new key empties the file picker after an upload

  async function upload(e: FormEvent) {
    e.preventDefault()
    if (!file) return setProblem('Choose a photo first.')
    const fileProblem = imageFileProblem(file)
    if (fileProblem) return setProblem(fileProblem)
    if (!altText.trim())
      return setProblem(
        'Describe the photo for people who can’t see it, e.g. “Navy oxford shirt, front view”.',
      )
    setBusy(true)
    setProblem(null)
    const r = await uploadImage(product.id, file, {
      altText: altText.trim(),
      variantId: variantId || null,
    })
    setBusy(false)
    if (!r.ok) return setProblem(r.message)
    setFile(null)
    setAltText('')
    setVariantId('')
    setInputKey((k) => k + 1)
    onUploaded()
  }

  return (
    <form
      onSubmit={upload}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h3 className="font-medium">Add a photo</h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="photo-file" className="text-sm font-medium">
          Photo
        </label>
        <input
          id="photo-file"
          key={inputKey}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          aria-describedby="photo-file-hint"
          className="text-sm"
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null
            setFile(chosen)
            setProblem(chosen ? imageFileProblem(chosen) : null)
          }}
        />
        <span id="photo-file-hint" className="text-xs text-muted-foreground">
          JPEG, PNG or WebP, up to 5 MB. {PHOTO_HINT.product}
        </span>
      </div>
      <Input
        label="Alt text"
        value={altText}
        maxLength={200}
        onChange={(e) => setAltText(e.target.value)}
        hint="What the photo shows, for screen readers and Google Images."
      />
      <SelectField
        label="Shows colour/size"
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
      >
        <option value="">All of them</option>
        {variantOptions(product).map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <FormProblem message={problem} />
      <Button type="submit" variant="secondary" disabled={busy} className="self-start">
        {busy ? 'Uploading…' : 'Upload photo'}
      </Button>
    </form>
  )
}
