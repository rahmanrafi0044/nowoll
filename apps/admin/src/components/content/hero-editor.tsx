'use client'

import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useState } from 'react'
import type { AdminContentBlock } from '@/lib/content-api'
import { saveContentBlock } from '@/lib/content-api'
import { ImageField, LIVE_NOTE, LinkInput, SaveProblems } from './fields'

type Hero = {
  heading?: string
  subheading?: string | null
  ctaLabel?: string
  ctaHref?: string
  imageUrl?: string | null
  imageAlt?: string | null
}

/** The big banner at the top of the homepage (step 36). Its place on the page is set in "Sections". */
export function HeroEditor({ block, onSaved }: { block: AdminContentBlock; onSaved: () => void }) {
  const saved = (block.data ?? {}) as Hero
  const [heading, setHeading] = useState(saved.heading ?? '')
  const [subheading, setSubheading] = useState(saved.subheading ?? '')
  const [ctaLabel, setCtaLabel] = useState(saved.ctaLabel ?? 'Shop now')
  const [ctaHref, setCtaHref] = useState(saved.ctaHref ?? '/shop')
  const [imageUrl, setImageUrl] = useState<string | null>(saved.imageUrl ?? null)
  const [imageAlt, setImageAlt] = useState(saved.imageAlt ?? '')
  const [on, setOn] = useState(block.data ? block.isActive : true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)
  const [done, setDone] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!heading.trim()) return setProblem({ message: 'Write a heading.' })
    if (imageUrl && !imageAlt.trim())
      return setProblem({ message: 'Describe the picture (for screen readers and Google).' })
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
