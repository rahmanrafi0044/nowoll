'use client'

import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import {
  type AdminContentBlock,
  clearContentBlock,
  fetchContentBlock,
  saveContentBlock,
} from '@/lib/content-api'
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
  const [done, setDone] = useState<string | null>(null)
  // What is saved right now (updated after every save) — Hide re-saves THIS,
  // not the boxes, which may be half-edited.
  const [savedData, setSavedData] = useState<unknown>(block.data)
  // Is the bar on the shop right now (as saved)? Drives "Hide from the shop".
  const [live, setLive] = useState(Boolean(block.data) && block.isActive && block.valid)
  const [confirming, setConfirming] = useState<'hide' | 'remove' | null>(null)

  const start = () => {
    setBusy(true)
    setProblem(null)
    setDone(null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    // Empty boxes + Save = "remove the announcement" (asks first). Nothing saved → nothing to remove.
    if (!text.trim() && !href.trim() && savedData) return setConfirming('remove')
    if (!text.trim()) return setProblem({ message: 'Write the announcement (up to 120 letters).' })
    start()
    const r = await saveContentBlock('announcement_bar', { text, href: href.trim() || null }, on)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setSavedData(r.data.data)
    setLive(on)
    setDone(LIVE_NOTE)
  }

  // Pause: the bar leaves the shop, the words stay for next time.
  async function hide() {
    setConfirming(null)
    start()
    const r = await saveContentBlock('announcement_bar', savedData, false)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setLive(false)
    setOn(false)
    setDone('Hidden — the shop stops showing the bar within a minute. Your words are kept.')
  }

  // Remove: the bar leaves the shop AND its words are deleted (the API keeps
  // an empty, switched-off record — a soft clear).
  async function remove() {
    setConfirming(null)
    start()
    const r = await clearContentBlock('announcement_bar')
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setSavedData(null)
    setLive(false)
    setOn(true) // the boxes are already empty; a new announcement starts switched on
    setDone('Removed — the shop stops showing the bar within a minute.')
  }

  function clear() {
    setText('')
    setHref('')
    setDone(null)
    setProblem(null)
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" disabled={busy || (!text && !href)} onClick={clear}>
          Clear
        </Button>
        {live && !confirming && (
          <Button variant="secondary" disabled={busy} onClick={() => setConfirming('hide')}>
            Hide from the shop
          </Button>
        )}
        {done && (
          <span role="status" className="text-sm text-success">
            {done}
          </span>
        )}
      </div>
      {confirming === 'hide' && (
        <Confirm
          label="Confirm hiding the announcement"
          question="Hide the announcement from the shop? Your words are kept — tick “Show it on the shop” and save to bring it back."
          no="Keep it showing"
          yes="Yes, hide it"
          onNo={() => setConfirming(null)}
          onYes={() => void hide()}
        />
      )}
      {confirming === 'remove' && (
        <Confirm
          label="Confirm removing the announcement"
          question="The boxes are empty. Remove the announcement? It disappears from the shop and its words are deleted."
          no="Keep it"
          yes="Yes, remove it"
          onNo={() => setConfirming(null)}
          onYes={() => void remove()}
        />
      )}
    </form>
  )
}

function Confirm(p: {
  label: string
  question: string
  no: string
  yes: string
  onNo: () => void
  onYes: () => void
}) {
  return (
    <div
      role="group"
      aria-label={p.label}
      className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3 text-sm"
    >
      <span className="mr-auto">{p.question}</span>
      <Button variant="secondary" size="sm" onClick={p.onNo}>
        {p.no}
      </Button>
      <Button size="sm" onClick={p.onYes}>
        {p.yes}
      </Button>
    </div>
  )
}
