'use client'

import {
  DEFAULT_HOMEPAGE_LAYOUT,
  type HomepageSection,
  readHomepageLayout,
  TRUST_BADGE_ICONS,
  type TrustBadgeIcon,
} from '@nowoll/validation'
import { Button, Input } from '@nowoll/ui'
import { useEffect, useState } from 'react'
import { SelectField } from '@/components/form-fields'
import { flattenCategories } from '@/lib/categories'
import type { AdminContentBlock } from '@/lib/content-api'
import { saveContentBlock } from '@/lib/content-api'
import type { CategoryNode } from '@/lib/products-api'
import { ImageField, LIVE_NOTE, LinkInput, SaveProblems } from './fields'

// ============================================================================
// The homepage builder (step 36): an ORDERED list of sections. Move a section
// up/down (buttons — they work from the keyboard), show/hide it, edit what it
// says, add product rows, banners and trust badges. Nothing saved yet → the
// list starts as today's homepage. Saved as one block ("homepage_layout");
// the API refuses anything outside the format (docs/admin-editable.md).
// ============================================================================

type Section = HomepageSection
type Kind = Section['type']

export const SECTION_LABEL: Record<Kind, string> = {
  hero: 'Hero (big banner)',
  categories: 'Categories',
  featured: 'Featured products',
  new_arrivals: 'New arrivals',
  products: 'Product row',
  banners: 'Promo banners',
  trust_badges: 'Trust badges',
  newsletter: 'Newsletter sign-up',
}

export const ICON_LABEL: Record<TrustBadgeIcon, string> = {
  truck: 'Delivery truck',
  cash: 'Cash',
  return: 'Return arrow',
  shield: 'Shield',
  phone: 'Phone',
  star: 'Star',
}

const newId = (kind: Kind) => `${kind.replace('_', '-')}-${Math.random().toString(36).slice(2, 6)}`

/** A new section of this kind, ready to fill in. */
export function newSection(kind: Kind): Section {
  const base = { id: newId(kind), visible: true }
  switch (kind) {
    case 'products':
      return { ...base, type: 'products', title: '', source: { kind: 'tag', tag: '' }, limit: 8 }
    case 'banners':
      return {
        ...base,
        type: 'banners',
        banners: [{ imageUrl: '', imageAlt: '', text: null, href: null }],
      }
    case 'trust_badges':
      return {
        ...base,
        type: 'trust_badges',
        badges: [
          { icon: 'cash', text: 'Cash on delivery' },
          { icon: 'truck', text: 'Nationwide delivery' },
          { icon: 'return', text: 'Easy returns' },
        ],
      }
    case 'categories':
    case 'featured':
    case 'new_arrivals':
      return { ...base, type: kind, title: null }
    default:
      return { ...base, type: kind } as Section
  }
}

/** Moves item i up (-1) or down (+1). */
export const move = <T,>(list: T[], i: number, by: -1 | 1): T[] => {
  const next = [...list]
  ;[next[i], next[i + by]] = [next[i + by]!, next[i]!]
  return next
}

/** Only one of these may be on the page (the others can be added many times). */
const SINGLE: Kind[] = ['hero', 'categories', 'featured', 'new_arrivals', 'newsletter']

export function LayoutEditor({
  block,
  categories,
  onSaved,
}: {
  block: AdminContentBlock
  categories: CategoryNode[]
  onSaved: () => void
}) {
  const initial = block.data
    ? readHomepageLayout(block.data).sections
    : DEFAULT_HOMEPAGE_LAYOUT.sections
  const [sections, setSections] = useState<Section[]>(initial)
  const [adding, setAdding] = useState<Kind | ''>('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)
  const [done, setDone] = useState(false)
  const dirty = JSON.stringify(sections) !== JSON.stringify(initial)

  // "Leave site? Changes you made may not be saved."
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (i: number, s: Section) => {
    setDone(false)
    setSections((all) => all.map((x, j) => (j === i ? s : x)))
  }
  const change = (next: Section[]) => {
    setDone(false)
    setSections(next)
  }
  const addable = (Object.keys(SECTION_LABEL) as Kind[]).filter(
    (k) => !SINGLE.includes(k) || !sections.some((s) => s.type === k),
  )

  async function save() {
    setBusy(true)
    setProblem(null)
    setDone(false)
    const r = await saveContentBlock('homepage_layout', { sections }, true)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setDone(true)
    onSaved()
  }

  return (
    <div className="flex flex-col gap-4">
      {!block.valid && (
        <p className="rounded-control bg-warning-soft p-3 text-sm text-warning">
          Part of what’s saved no longer fits the rules — those sections are hidden on the shop and
          left out below. Save to clean it up.
        </p>
      )}
      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sections — the homepage would be empty. Add some below.
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {sections.map((s, i) => (
          <li
            key={s.id}
            className={`rounded-lg border border-border p-4 ${s.visible ? '' : 'opacity-70'}`}
          >
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">{`${i + 1}. ${SECTION_LABEL[s.type]}`}</legend>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto font-medium">
                  {i + 1}. {SECTION_LABEL[s.type]}
                  {!s.visible && (
                    <span className="ml-2 text-xs text-muted-foreground">(hidden)</span>
                  )}
                </span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={s.visible}
                    onChange={(e) => update(i, { ...s, visible: e.target.checked })}
                  />
                  Show
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={i === 0}
                  aria-label={`Move ${SECTION_LABEL[s.type]} up`}
                  onClick={() => change(move(sections, i, -1))}
                >
                  ↑
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={i === sections.length - 1}
                  aria-label={`Move ${SECTION_LABEL[s.type]} down`}
                  onClick={() => change(move(sections, i, 1))}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${SECTION_LABEL[s.type]}`}
                  onClick={() => change(sections.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
              <SectionFields s={s} categories={categories} onChange={(next) => update(i, next)} />
            </fieldset>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Add a section"
          value={adding}
          onChange={(e) => setAdding(e.target.value as Kind | '')}
        >
          <option value="">Choose…</option>
          {addable.map((k) => (
            <option key={k} value={k}>
              {SECTION_LABEL[k]}
            </option>
          ))}
        </SelectField>
        <Button
          variant="secondary"
          disabled={!adding}
          onClick={() => {
            if (!adding) return
            change([...sections, newSection(adding)])
            setAdding('')
          }}
        >
          Add
        </Button>
      </div>
      <SaveProblems problem={problem} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : 'Save sections'}
        </Button>
        {dirty && <span className="text-sm text-warning">Unsaved changes</span>}
        {done && (
          <span role="status" className="text-sm text-success">
            {LIVE_NOTE}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={() => change(DEFAULT_HOMEPAGE_LAYOUT.sections)}>
          Reset to the standard homepage
        </Button>
      </div>
    </div>
  )
}

function SectionFields({
  s,
  categories,
  onChange,
}: {
  s: Section
  categories: CategoryNode[]
  onChange: (s: Section) => void
}) {
  switch (s.type) {
    case 'hero':
      return (
        <p className="text-sm text-muted-foreground">
          Edit its heading, button and picture in “Hero” above.
        </p>
      )
    case 'newsletter':
      return <p className="text-sm text-muted-foreground">The email sign-up box.</p>
    case 'categories':
    case 'featured':
    case 'new_arrivals':
      return (
        <Input
          label="Title (optional)"
          value={s.title ?? ''}
          maxLength={60}
          placeholder={
            s.type === 'categories'
              ? 'Shop by category'
              : s.type === 'featured'
                ? 'Featured'
                : 'New arrivals'
          }
          onChange={(e) => onChange({ ...s, title: e.target.value || null })}
        />
      )
    case 'products': {
      const options = flattenCategories(categories)
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Title"
            value={s.title}
            maxLength={60}
            onChange={(e) => onChange({ ...s, title: e.target.value })}
            placeholder="Eid collection"
          />
          <SelectField
            label="How many products"
            value={String(s.limit)}
            onChange={(e) => onChange({ ...s, limit: Number(e.target.value) })}
          >
            {[4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Products from"
            value={s.source.kind}
            onChange={(e) =>
              onChange({
                ...s,
                source:
                  e.target.value === 'category'
                    ? { kind: 'category', slug: '' }
                    : { kind: 'tag', tag: '' },
              })
            }
          >
            <option value="tag">Products with a tag</option>
            <option value="category">A category</option>
          </SelectField>
          {s.source.kind === 'tag' ? (
            <Input
              label="Tag"
              value={s.source.tag}
              maxLength={30}
              onChange={(e) => onChange({ ...s, source: { kind: 'tag', tag: e.target.value } })}
              hint="Exactly as written on the products’ Tags, e.g. eid."
            />
          ) : (
            <SelectField
              label="Category"
              value={s.source.slug}
              onChange={(e) =>
                onChange({ ...s, source: { kind: 'category', slug: e.target.value } })
              }
            >
              <option value="">Choose…</option>
              {options.map((c) => (
                <option key={c.id} value={categorySlug(categories, c.id)}>
                  {c.label}
                </option>
              ))}
            </SelectField>
          )}
        </div>
      )
    }
    case 'banners':
      return (
        <div className="flex flex-col gap-4">
          {s.banners.map((b, j) => {
            const set = (patch: Partial<typeof b>) =>
              onChange({
                ...s,
                banners: s.banners.map((x, k) => (k === j ? { ...x, ...patch } : x)),
              })
            return (
              <div key={j} className="flex flex-col gap-3 rounded-control border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Banner {j + 1}</span>
                  {s.banners.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onChange({ ...s, banners: s.banners.filter((_, k) => k !== j) })
                      }
                    >
                      Remove banner {j + 1}
                    </Button>
                  )}
                </div>
                <ImageField
                  label={`Picture for banner ${j + 1}`}
                  url={b.imageUrl || null}
                  required
                  onChange={(url) => set({ imageUrl: url ?? '' })}
                />
                <Input
                  label="Describe the picture"
                  value={b.imageAlt}
                  maxLength={200}
                  onChange={(e) => set({ imageAlt: e.target.value })}
                />
                <Input
                  label="Text on the banner (optional)"
                  value={b.text ?? ''}
                  maxLength={80}
                  onChange={(e) => set({ text: e.target.value || null })}
                />
                <LinkInput
                  label="Link (optional)"
                  value={b.href ?? ''}
                  onChange={(v) => set({ href: v.trim() || null })}
                />
              </div>
            )
          })}
          {s.banners.length < 3 && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() =>
                onChange({
                  ...s,
                  banners: [...s.banners, { imageUrl: '', imageAlt: '', text: null, href: null }],
                })
              }
            >
              Add a banner
            </Button>
          )}
        </div>
      )
    case 'trust_badges':
      return (
        <div className="flex flex-col gap-3">
          {s.badges.map((b, j) => {
            const set = (patch: Partial<typeof b>) =>
              onChange({ ...s, badges: s.badges.map((x, k) => (k === j ? { ...x, ...patch } : x)) })
            return (
              <div key={j} className="grid items-end gap-2 sm:grid-cols-[10rem_1fr_auto]">
                <SelectField
                  label={`Icon ${j + 1}`}
                  value={b.icon}
                  onChange={(e) => set({ icon: e.target.value as TrustBadgeIcon })}
                >
                  {TRUST_BADGE_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {ICON_LABEL[icon]}
                    </option>
                  ))}
                </SelectField>
                <Input
                  label={`Text ${j + 1}`}
                  value={b.text}
                  maxLength={40}
                  onChange={(e) => set({ text: e.target.value })}
                />
                {s.badges.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...s, badges: s.badges.filter((_, k) => k !== j) })}
                  >
                    Remove
                  </Button>
                )}
              </div>
            )
          })}
          {s.badges.length < 4 && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => onChange({ ...s, badges: [...s.badges, { icon: 'star', text: '' }] })}
            >
              Add a badge
            </Button>
          )}
        </div>
      )
  }
}

/** The category tree gives ids; product rows store the category's web address (slug). */
function categorySlug(nodes: CategoryNode[], id: string): string {
  for (const n of nodes) {
    if (n.id === id) return n.slug ?? ''
    const found = categorySlug(n.children ?? [], id)
    if (found) return found
  }
  return ''
}
