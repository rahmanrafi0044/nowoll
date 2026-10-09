'use client'

import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { type AdminContentBlock, fetchContentBlock, saveContentBlock } from '@/lib/content-api'
import { LIVE_NOTE, LinkInput, SaveProblems } from './fields'

/** The thin strip above the shop's header (step 36). */
export function AnnouncementEditor() {
  const load = useCallback(() => fetchContentBlock('announcement_bar'), [])
  const { state, retry } = useLoad(load)
  return (
    <Panel title="Announcement bar" state={state} retry={retry}>
      {(block) => <Form key={block.updatedAt ?? 'new'} block={block} />}
    </Panel>
  )
}

function Form({ block }: { block: AdminContentBlock }) {
  const saved = (block.data ?? {}) as { text?: string; href?: string | null }
  const [text, setText] = useState(saved.text ?? '')
  const [href, setHref] = useState(saved.href ?? '')
  const [on, setOn] = useState(block.data ? block.isActive : true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)
  const [done, setDone] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return setProblem({ message: 'Write the announcement (up to 120 letters).' })
    setBusy(true)
    setProblem(null)
    setDone(false)
    const r = await saveContentBlock('announcement_bar', { text, href: href.trim() || null }, on)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setDone(true)
  }

  return (
    <form onSubmit={save} noValidate className="flex max-w-2xl flex-col gap-4">
      {!block.valid && (
        <p className="rounded-control bg-warning-soft p-3 text-sm text-warning">
          What’s saved no longer fits the rules, so the shop hides it. Fix it here and save.
        </p>
      )}
      <Input
        label="Text"
        value={text}
        maxLength={120}
        onChange={(e) => setText(e.target.value)}
        hint={`${text.length} / 120 — e.g. “Free delivery in Dhaka over ৳2,000”.`}
      />
      <LinkInput label="Link (optional)" value={href} onChange={setHref} />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        Show it on the shop
      </label>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Preview</p>
        {/* Same look as the shop's bar. */}
        <div
          aria-label="Preview of the announcement bar"
          className={`bg-brand px-4 py-2 text-center text-sm text-brand-foreground ${on ? '' : 'opacity-40'}`}
        >
          {text.trim() || 'Your announcement'}
          {href.trim() && <span className="underline underline-offset-4"> →</span>}
        </div>
      </div>
      <SaveProblems problem={problem} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
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
