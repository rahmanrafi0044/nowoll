'use client'

import type { InventoryRow, StockAdjustResult } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { type FormEvent, useState } from 'react'
import { Dialog } from '@/components/dialog'
import { FormProblem, TextArea } from '@/components/form-fields'
import { adjustStock } from '@/lib/inventory-api'

// ============================================================================
// Changing stock by hand. Two ways, because they mean different things:
//   • ADD / REMOVE  "+20 arrived", "−2 damaged" — relative, so orders placed
//                   at the same moment are never lost (the API adds/subtracts)
//   • SET TO        a stock take: "I counted 14" — the count is the truth
// A note is always required: the history must say WHY stock changed.
// ============================================================================

const QUICK_NOTES = ['Received from supplier', 'Damaged', 'Stock count', 'Lost / stolen']

type Mode = 'change' | 'set'

/** The stock after this form's numbers, or a problem. Shown before saving. */
export function previewStock(
  current: number,
  mode: Mode,
  text: string,
): { after: number } | { problem: string } | null {
  const t = text.trim()
  if (t === '' || t === '-' || t === '+') return null
  if (mode === 'set') {
    if (!/^\d+$/.test(t)) return { problem: 'Enter the counted number (0 or more).' }
    return { after: Number(t) }
  }
  if (!/^[+-]?\d+$/.test(t)) return { problem: 'Enter a whole number, e.g. 20 or −2.' }
  const change = Number(t)
  if (change === 0) return { problem: 'A change of 0 changes nothing.' }
  if (current + change < 0)
    return { problem: `Only ${current} in stock — you can remove at most ${current}.` }
  return { after: current + change }
}

export function AdjustDialog({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow | null
  onClose: () => void
  onSaved: (result: StockAdjustResult) => void
}) {
  return (
    <Dialog title="Change stock" open={row !== null} onClose={onClose}>
      {/* A fresh form for every variant opened. */}
      {row && <AdjustForm key={row.variantId} row={row} onSaved={onSaved} />}
    </Dialog>
  )
}

function AdjustForm({
  row,
  onSaved,
}: {
  row: InventoryRow
  onSaved: (r: StockAdjustResult) => void
}) {
  const [mode, setMode] = useState<Mode>('change')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const preview = previewStock(row.stock, mode, amount.replace('−', '-'))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!preview)
      return setProblem(
        mode === 'set' ? 'Enter the counted number.' : 'Enter how many to add or remove.',
      )
    if ('problem' in preview) return setProblem(preview.problem)
    if (note.trim().length < 3) return setProblem('Say why the stock changed (at least 3 letters).')
    const n = Number(amount.replace('−', '-').trim())
    setBusy(true)
    setProblem(null)
    const r = await adjustStock(
      row.variantId,
      mode === 'set' ? { setTo: n, note: note.trim() } : { change: n, note: note.trim() },
    )
    setBusy(false)
    if (!r.ok) return setProblem(r.message)
    onSaved(r.data)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-medium">{row.product.name}</span> · {row.size} / {row.color} ·{' '}
        {row.sku}
        <span className="block text-muted-foreground">
          Now in stock: <span className="font-semibold text-foreground">{row.stock}</span>
        </span>
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">How?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            className="size-4"
            checked={mode === 'change'}
            onChange={() => setMode('change')}
          />
          Add or remove (e.g. 20 arrived, −2 damaged)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            className="size-4"
            checked={mode === 'set'}
            onChange={() => setMode('set')}
          />
          Set the exact count (stock take)
        </label>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="adjust-amount" className="text-sm font-medium">
          {mode === 'set' ? 'Counted' : 'Add (+) or remove (−)'}
        </label>
        <input
          id="adjust-amount"
          inputMode={mode === 'set' ? 'numeric' : 'text'}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-describedby="adjust-preview"
          className="h-11 w-40 rounded-control border border-border-strong bg-surface px-3 text-base"
        />
        <p id="adjust-preview" className="text-sm" aria-live="polite">
          {preview && 'after' in preview && (
            <span>
              {row.stock} → <span className="font-semibold">{preview.after}</span>
              {preview.after <= row.threshold && preview.after < row.stock && (
                <span className="text-warning">
                  {' '}
                  (at or below the alert limit of {row.threshold})
                </span>
              )}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick notes">
        {QUICK_NOTES.map((q) => (
          <Button key={q} variant="secondary" size="sm" onClick={() => setNote(q)}>
            {q}
          </Button>
        ))}
      </div>
      <TextArea
        label="Note"
        value={note}
        maxLength={300}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        hint="Required — the history shows why stock changed."
      />
      <FormProblem message={problem} />
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}
