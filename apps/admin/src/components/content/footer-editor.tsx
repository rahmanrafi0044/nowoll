'use client'

import { Button, Input } from '@nowoll/ui'
import { type Footer, footerSchema, PAYMENT_BADGES, type PaymentBadge } from '@nowoll/validation'
import { useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { TextArea } from '@/components/form-fields'
import { type AdminContentBlock, fetchContentBlock, saveContentBlock } from '@/lib/content-api'
import { LinkInput, SaveProblems } from './fields'

// ============================================================================
// Admin → Content → Footer (step 38b): about text, up to 3 link columns,
// the automatic "Track your order + pages" list, payment badges (a fixed
// list — plain text badges) and the copyright line ({year} → this year).
// The contact details and social links are in Settings.
// ============================================================================

type Column = Footer['columns'][number]

const newColumn = (): Column => ({
  id: `col-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  links: [{ label: '', href: '' }],
})

export function FooterEditor() {
  const load = useCallback(() => fetchContentBlock('footer'), [])
  const { state, retry } = useLoad(load)
  return (
    <Panel title="Footer" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(block) => <FooterForm key={block.updatedAt ?? 'new'} block={block} />}
    </Panel>
  )
}

export function FooterForm({ block }: { block: AdminContentBlock }) {
  const parsed = footerSchema.safeParse(block.data ?? {})
  const initial = parsed.success ? parsed.data : footerSchema.parse({})
  const [f, setF] = useState<Footer>(initial)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change = (patch: Partial<Footer>) => {
    setDone(null)
    setF((x) => ({ ...x, ...patch }))
  }
  const setColumn = (i: number, col: Column) =>
    change({ columns: f.columns.map((c, j) => (j === i ? col : c)) })
  const toggleBadge = (key: PaymentBadge) =>
    change({
      payments: PAYMENT_BADGES.map((b) => b.key).filter((k) =>
        k === key ? !f.payments.includes(key) : f.payments.includes(k),
      ),
    })

  async function save() {
    const check = footerSchema.safeParse(f)
    if (!check.success)
      return setProblem({
        message: 'Some parts need fixing:',
        details: check.error.issues.map((i) => {
          const col =
            i.path[0] === 'columns' && typeof i.path[1] === 'number'
              ? `Column ${i.path[1] + 1}: `
              : ''
          return `${col}${i.message}`
        }),
      })
    setBusy(true)
    setProblem(null)
    const r = await saveContentBlock('footer', check.data, true)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setDone('Saved. The shop shows it within a minute.')
  }

  const year = new Date().getFullYear()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Footer</h1>
      <p className="text-sm text-muted-foreground">
        Contact details and social links are in Settings. Here: the about text, link columns,
        payment badges and the copyright line.
      </p>

      <TextArea
        label="About text (optional)"
        value={f.about}
        maxLength={300}
        rows={3}
        placeholder="Everyday clothing, made in Dhaka."
        onChange={(e) => change({ about: e.target.value })}
        hint="A few lines under the store name. Plain text."
      />

      <section aria-label="Link columns" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Link columns</h2>
        {f.columns.map((col, i) => (
          <fieldset
            key={col.id}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <legend className="sr-only">{`Column ${i + 1}`}</legend>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label={`Column ${i + 1} title`}
                  value={col.title}
                  maxLength={40}
                  placeholder="Help"
                  onChange={(e) => setColumn(i, { ...col, title: e.target.value })}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => change({ columns: f.columns.filter((_, j) => j !== i) })}
              >
                Remove column {i + 1}
              </Button>
            </div>
            {col.links.map((l, k) => (
              <div key={k} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  label={`Link ${k + 1} text`}
                  value={l.label}
                  maxLength={40}
                  onChange={(e) =>
                    setColumn(i, {
                      ...col,
                      links: col.links.map((x, m) =>
                        m === k ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                />
                <LinkInput
                  label={`Link ${k + 1} address`}
                  value={l.href}
                  onChange={(v) =>
                    setColumn(i, {
                      ...col,
                      links: col.links.map((x, m) => (m === k ? { ...x, href: v } : x)),
                    })
                  }
                />
                {col.links.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setColumn(i, { ...col, links: col.links.filter((_, m) => m !== k) })
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {col.links.length < 8 && (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() =>
                  setColumn(i, { ...col, links: [...col.links, { label: '', href: '' }] })
                }
              >
                Add a link
              </Button>
            )}
          </fieldset>
        ))}
        {f.columns.length < 3 && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => change({ columns: [...f.columns, newColumn()] })}
          >
            Add a column
          </Button>
        )}
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={f.autoPages}
            onChange={(e) => change({ autoPages: e.target.checked })}
          />
          Also list “Track your order” and every published page automatically
        </label>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-lg font-semibold">Payment badges</legend>
        <p className="text-sm text-muted-foreground">
          Small “We accept” badges at the bottom of the footer. Tick only what you really accept.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {PAYMENT_BADGES.map((b) => (
            <label key={b.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={f.payments.includes(b.key)}
                onChange={() => toggleBadge(b.key)}
              />
              {b.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Input
          label="Copyright line (optional)"
          value={f.copyright}
          maxLength={120}
          placeholder="© {year} Nowoll. All prices in BDT (৳)."
          onChange={(e) => change({ copyright: e.target.value })}
          hint="{year} becomes the current year. Empty = the standard line."
        />
        <p aria-label="Copyright preview" className="text-xs text-muted-foreground">
          Preview:{' '}
          {f.copyright.trim()
            ? f.copyright.trim().replaceAll('{year}', String(year))
            : `© ${year} (store name). All prices in BDT (৳).`}
        </p>
      </div>

      <SaveProblems problem={problem} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || (!dirty && Boolean(block.data))} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save footer'}
        </Button>
        {dirty && <span className="text-sm text-warning">Unsaved changes</span>}
        {done && (
          <span role="status" className="text-sm text-success">
            {done}
          </span>
        )}
      </div>
    </div>
  )
}
