'use client'

import { Button, Input } from '@nowoll/ui'
import { type Dispatch, type FormEvent, type SetStateAction, useState } from 'react'
import type { AdminContentBlock } from '@/lib/content-api'
import { saveContentBlock } from '@/lib/content-api'
import { ImageField, LIVE_NOTE, LinkInput, SaveProblems } from './fields'

type Slide = {
  heading: string
  subheading: string | null
  ctaLabel: string
  ctaHref: string
  imageUrl: string | null
  imageAlt: string | null
}
type Hero = Partial<Slide> & { more?: Slide[] }

/** The first slide plus at most this many more (the API checks the same). */
const MAX_MORE = 3
const emptySlide = (): Slide => ({
  heading: '',
  subheading: null,
  ctaLabel: 'Shop now',
  ctaHref: '/shop',
  imageUrl: null,
  imageAlt: null,
})

/** The big banner at the top of the homepage (step 36). Its place on the page is set in "Sections". */
export function HeroEditor({ block, onSaved }: { block: AdminContentBlock; onSaved: () => void }) {
  const saved = (block.data ?? {}) as Hero
  const [heading, setHeading] = useState(saved.heading ?? '')
  const [subheading, setSubheading] = useState(saved.subheading ?? '')
  const [ctaLabel, setCtaLabel] = useState(saved.ctaLabel ?? 'Shop now')
  const [ctaHref, setCtaHref] = useState(saved.ctaHref ?? '/shop')
  const [imageUrl, setImageUrl] = useState<string | null>(saved.imageUrl ?? null)
  const [imageAlt, setImageAlt] = useState(saved.imageAlt ?? '')
  // 38f: extra slides that take turns with the first one on the shop.
  const [more, setMore] = useState<Slide[]>(saved.more ?? [])
  const [on, setOn] = useState(block.data ? block.isActive : true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)
  const [done, setDone] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!heading.trim()) return setProblem({ message: 'Write a heading.' })
    if (imageUrl && !imageAlt.trim())
      return setProblem({ message: 'Describe the picture (for screen readers and Google).' })
    for (const [j, m] of more.entries()) {
      if (!m.heading.trim()) return setProblem({ message: `Slide ${j + 2}: write a heading.` })
      if (!m.ctaLabel.trim())
        return setProblem({ message: `Slide ${j + 2}: write the button text.` })
      if (m.imageUrl && !m.imageAlt?.trim())
        return setProblem({ message: `Slide ${j + 2}: describe the picture.` })
    }
    setBusy(true)
    setProblem(null)
    setDone(false)
    const r = await saveContentBlock(
      'homepage_hero',
      {
        heading,
        subheading: subheading.trim() || null,
        ctaLabel,
        ctaHref: ctaHref.trim(),
        imageUrl,
        imageAlt: imageUrl ? imageAlt : null,
        more: more.map((m) => ({
          ...m,
          subheading: m.subheading?.trim() || null,
          ctaHref: m.ctaHref.trim(),
          imageAlt: m.imageUrl ? m.imageAlt : null,
        })),
      },
      on,
    )
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setDone(true)
    onSaved()
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      {!block.valid && (
        <p className="rounded-control bg-warning-soft p-3 text-sm text-warning">
          What’s saved no longer fits the rules, so the shop hides the hero. Fix it here and save.
        </p>
      )}
      <Input
        label="Heading"
        value={heading}
        maxLength={80}
        onChange={(e) => setHeading(e.target.value)}
      />
      <Input
        label="Text under the heading (optional)"
        value={subheading}
        maxLength={200}
        onChange={(e) => setSubheading(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Button text"
          value={ctaLabel}
          maxLength={30}
          onChange={(e) => setCtaLabel(e.target.value)}
        />
        <LinkInput label="Button link" value={ctaHref} onChange={setCtaHref} />
      </div>
      <ImageField label="Background picture (optional)" url={imageUrl} onChange={setImageUrl} />
      {imageUrl && (
        <Input
          label="Describe the picture"
          value={imageAlt}
          maxLength={200}
          onChange={(e) => setImageAlt(e.target.value)}
          hint="For screen readers and Google Images, e.g. “Model in a navy panjabi”."
        />
      )}
      <MoreSlides more={more} setMore={setMore} />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        Show the hero on the shop
      </label>
      <SaveProblems problem={problem} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save hero'}
        </Button>
        {done && (
          <span role="status" className="text-sm text-success">
            {LIVE_NOTE}
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * Slides 2–4 (design refresh 38f). Each is edited like the first. Every change
 * goes through `setMore(all => …)` — the FUNCTIONAL form of a state update —
 * so a photo that finishes uploading a few seconds later changes only its own
 * slide's photo and never undoes words typed in the meantime.
 */
function MoreSlides({
  more,
  setMore,
}: {
  more: Slide[]
  setMore: Dispatch<SetStateAction<Slide[]>>
}) {
  const patch = (j: number, p: Partial<Slide>) =>
    setMore((all) => all.map((x, k) => (k === j ? { ...x, ...p } : x)))
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">More slides (optional)</legend>
      <p className="text-sm text-muted-foreground">
        With more than one slide they take turns every few seconds, with a pause button for
        shoppers.
      </p>
      {more.map((m, j) => {
        const n = j + 2
        return (
          <div key={j} className="flex flex-col gap-3 rounded-control border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Slide {n}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMore((all) => all.filter((_, k) => k !== j))}
              >
                Remove slide {n}
              </Button>
            </div>
            <Input
              label={`Slide ${n} heading`}
              value={m.heading}
              maxLength={80}
              onChange={(e) => patch(j, { heading: e.target.value })}
            />
            <Input
              label={`Slide ${n} text (optional)`}
              value={m.subheading ?? ''}
              maxLength={200}
              onChange={(e) => patch(j, { subheading: e.target.value || null })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={`Slide ${n} button text`}
                value={m.ctaLabel}
                maxLength={30}
                onChange={(e) => patch(j, { ctaLabel: e.target.value })}
              />
              <LinkInput
                label={`Slide ${n} button link`}
                value={m.ctaHref}
                onChange={(v) => patch(j, { ctaHref: v })}
              />
            </div>
            <ImageField
              label={`Slide ${n} picture (optional)`}
              url={m.imageUrl}
              onChange={(url) => patch(j, { imageUrl: url })}
            />
            {m.imageUrl && (
              <Input
                label={`Describe slide ${n}'s picture`}
                value={m.imageAlt ?? ''}
                maxLength={200}
                onChange={(e) => patch(j, { imageAlt: e.target.value })}
              />
            )}
          </div>
        )
      })}
      {more.length < MAX_MORE && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setMore((all) => [...all, emptySlide()])}
        >
          Add a slide
        </Button>
      )}
    </fieldset>
  )
}
