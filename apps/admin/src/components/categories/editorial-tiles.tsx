'use client'

import type { EditorialTileView } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import type { Dispatch, SetStateAction } from 'react'
import { ImageField } from '@/components/content/fields'
import { TextArea } from '@/components/form-fields'
import { PHOTO_HINT } from '@/lib/photo-sizes'

/** The boxes of one tile (numbers as typed, until saving). */
export interface TileForm {
  imageUrl: string | null
  imageAlt: string
  heading: string
  text: string
  href: string
  position: string
  wide: boolean
}

export const MAX_TILES = 3

export const toTileForm = (t: EditorialTileView): TileForm => ({
  imageUrl: t.imageUrl,
  imageAlt: t.imageAlt,
  heading: t.heading,
  text: t.text ?? '',
  href: t.href ?? '',
  position: String(t.position),
  wide: t.wide,
})

/** What the API receives. The API checks every tile again (categoryEditorialSchema). */
export const toTile = (f: TileForm) => ({
  imageUrl: f.imageUrl ?? '',
  imageAlt: f.imageAlt.trim(),
  heading: f.heading.trim(),
  text: f.text.trim() || null,
  href: f.href.trim() || null,
  position: Number(f.position),
  wide: f.wide,
})

const emptyTile = (position: number): TileForm => ({
  imageUrl: null,
  imageAlt: '',
  heading: '',
  text: '',
  href: '',
  position: String(position),
  wide: false,
})

/**
 * Admin → Categories → "Photo tiles in the product grid" (design refresh 38f):
 * up to 3 photos with a few words, shown among this category's products on
 * the first page (not while a customer is filtering). The "asymmetric" look:
 * a wide tile takes two columns.
 */
export function EditorialTiles({
  tiles,
  onChange,
}: {
  tiles: TileForm[]
  /** A state setter: every change is applied to the LATEST tiles (see below). */
  onChange: Dispatch<SetStateAction<TileForm[]>>
}) {
  // Functional updates: a photo upload finishes later, and must not put back
  // the tile as it was when the upload started (wiping words typed meanwhile).
  const set = (i: number, change: Partial<TileForm>) =>
    onChange((all) => all.map((t, j) => (j === i ? { ...t, ...change } : t)))

  return (
    <section aria-labelledby="tiles-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="tiles-heading" className="text-sm font-semibold">
          Photo tiles in the product grid (optional)
        </h2>
        <p className="text-sm text-muted-foreground">
          Up to {MAX_TILES} photos with a few words, placed among the products on the first page —
          e.g. a new collection. Not shown while a customer filters or sorts.
        </p>
      </div>
      {tiles.map((t, i) => (
        <fieldset
          key={i}
          className="grid gap-4 rounded-control border border-border p-4 sm:grid-cols-2"
        >
          <legend className="px-1 text-sm font-medium">Tile {i + 1}</legend>
          <ImageField
            label="Photo"
            url={t.imageUrl}
            onChange={(url) => set(i, { imageUrl: url })}
            required
            hint={PHOTO_HINT.tile}
          />
          <Input
            label="Describe the photo"
            value={t.imageAlt}
            maxLength={120}
            onChange={(e) => set(i, { imageAlt: e.target.value })}
            hint="e.g. “A model in a blush lawn three-piece”."
          />
          <Input
            label="Heading"
            value={t.heading}
            maxLength={60}
            onChange={(e) => set(i, { heading: e.target.value })}
            hint="e.g. The Eid edit"
          />
          <Input
            label="Link (optional)"
            value={t.href}
            maxLength={300}
            onChange={(e) => set(i, { href: e.target.value })}
            hint="A page on this shop like /shop/eid, or a full https:// link."
          />
          <TextArea
            label="Text (optional)"
            value={t.text}
            maxLength={160}
            rows={2}
            onChange={(e) => set(i, { text: e.target.value })}
          />
          <div className="flex flex-col gap-3">
            <Input
              label="Show after product number"
              inputMode="numeric"
              value={t.position}
              onChange={(e) => set(i, { position: e.target.value.replace(/\D/g, '') })}
              hint="1 = after the first product."
            />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4"
                checked={t.wide}
                onChange={(e) => set(i, { wide: e.target.checked })}
              />
              Wide (two columns on tablets and computers)
            </label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-danger sm:col-span-2"
            onClick={() => onChange((all) => all.filter((_, j) => j !== i))}
          >
            Remove tile {i + 1}
          </Button>
        </fieldset>
      ))}
      {tiles.length < MAX_TILES && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange((all) => [...all, emptyTile(all.length === 0 ? 4 : 10 * all.length)])
          }
        >
          Add a photo tile
        </Button>
      )}
    </section>
  )
}
