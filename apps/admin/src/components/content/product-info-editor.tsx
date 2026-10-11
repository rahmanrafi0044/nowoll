'use client'

import { Button, Input } from '@nowoll/ui'
import { type ProductInfo, productInfoLines, productInfoSchema } from '@nowoll/validation'
import { useEffect, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { type AdminContentBlock, fetchContentBlock, saveContentBlock } from '@/lib/content-api'
import { fetchSettings } from '@/lib/settings-api'
import { fetchZones } from '@/lib/shipping-api'
import { LinkInput, SaveProblems } from './fields'

// ============================================================================
// Admin → Content → Product info (step 38d): the "Delivery and returns" box
// under "Add to bag" on every product page. Delivery, returns and cash on
// delivery are AUTOMATIC lines (from Shipping and Settings) — so the box
// can't go out of date; you add your own lines and a link. The preview uses
// the same productInfoLines() as the shop.
// ============================================================================

type Live = Parameters<typeof productInfoLines>

/** The saved box, the switched-on delivery zones and the settings — loaded together. */
async function loadAll() {
  const [block, zones, settings] = await Promise.all([
    fetchContentBlock('product_info'),
    fetchZones(),
    fetchSettings(),
  ])
  if (!block.ok) return block
  if (!zones.ok) return zones
  if (!settings.ok) return settings
  return {
    ok: true as const,
    data: {
      block: block.data,
      zones: zones.data.filter((z) => z.isActive),
      settings: settings.data,
    },
  }
}

export function ProductInfoEditor() {
  const { state, retry } = useLoad(loadAll)
  return (
    <Panel title="Product info" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {({ block, zones, settings }) => (
        <ProductInfoForm
          key={block.updatedAt ?? 'new'}
          block={block}
          zones={zones}
          settings={settings}
        />
      )}
    </Panel>
  )
}

export function ProductInfoForm({
  block,
  zones,
  settings,
}: {
  block: AdminContentBlock
  zones: Live[1]
  settings: Live[2]
}) {
  const parsed = productInfoSchema.safeParse(block.data ?? {})
  const initial = parsed.success ? parsed.data : productInfoSchema.parse({})
  const initialOn = block.data ? block.isActive : true
  const [info, setInfo] = useState<ProductInfo>(initial)
  const [on, setOn] = useState(initialOn)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const dirty = JSON.stringify(info) !== JSON.stringify(initial) || on !== initialOn

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change = (patch: Partial<ProductInfo>) => {
    setDone(null)
    setInfo((x) => ({ ...x, ...patch }))
  }
  const lines = productInfoLines(info, zones, settings)

  async function save() {
    const check = productInfoSchema.safeParse(info)
    if (!check.success)
      return setProblem({
        message: 'Some parts need fixing:',
        details: check.error.issues.map((i) =>
          i.path[0] === 'lines' && typeof i.path[1] === 'number'
            ? `Your line ${i.path[1] + 1}: ${i.message}`
            : i.message,
        ),
      })
    setBusy(true)
    setProblem(null)
    const r = await saveContentBlock('product_info', check.data, on)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setDone(on ? 'Saved. Product pages show it within a minute.' : 'Saved — the box is hidden.')
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Product info</h1>
      <p className="text-sm text-muted-foreground">
        The “Delivery and returns” box under “Add to bag” on every product page. The automatic lines
        follow Shipping and Settings — change a fee there and the box follows.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4"
              checked={on}
              onChange={(e) => (setDone(null), setOn(e.target.checked))}
            />
            Show the box on product pages
          </label>
          <Input
            label="Title"
            value={info.title}
            maxLength={40}
            onChange={(e) => change({ title: e.target.value })}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Automatic lines</legend>
            {(
              [
                ['showDelivery', 'Delivery fees and times (from Shipping)'],
                ['showReturns', 'Returns (the return window in Settings)'],
                ['showCod', 'Cash on delivery (from Settings → Payments)'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={info[k]}
                  onChange={(e) => change({ [k]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-semibold">Your own lines</legend>
            {info.lines.map((text, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={`Line ${i + 1}`}
                    value={text}
                    maxLength={120}
                    onChange={(e) =>
                      change({ lines: info.lines.map((x, j) => (j === i ? e.target.value : x)) })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => change({ lines: info.lines.filter((_, j) => j !== i) })}
                >
                  Remove line {i + 1}
                </Button>
              </div>
            ))}
            {info.lines.length < 4 && (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => change({ lines: [...info.lines, ''] })}
              >
                Add a line
              </Button>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-semibold">Link (optional)</legend>
            {info.link ? (
              <>
                <Input
                  label="Link text"
                  value={info.link.label}
                  maxLength={40}
                  onChange={(e) => change({ link: { ...info.link!, label: e.target.value } })}
                />
                <LinkInput
                  label="Link address"
                  value={info.link.href}
                  onChange={(v) => change({ link: { ...info.link!, href: v } })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => change({ link: null })}
                >
                  Remove the link
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => change({ link: { label: 'Return policy', href: '/return-policy' } })}
              >
                Add a link
              </Button>
            )}
          </fieldset>
        </div>

        <section aria-label="Preview" className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Preview — as a product page shows it</span>
          <div
            className={`rounded-lg border border-border bg-surface p-4 ${on ? '' : 'opacity-50'}`}
          >
            <p className="mb-2 text-sm font-semibold">{info.title || 'Title'}</p>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No lines — tick an automatic line or add your own.
              </p>
            ) : (
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                {lines.map((l, i) => (
                  <li key={i}>{l.text}</li>
                ))}
              </ul>
            )}
            {info.link?.label && (
              <p className="mt-3 text-sm font-medium underline underline-offset-4">
                {info.link.label}
              </p>
            )}
          </div>
          {!on && (
            <p className="text-xs text-muted-foreground">
              Hidden on the shop while “Show the box” is off.
            </p>
          )}
        </section>
      </div>

      <SaveProblems problem={problem} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || (!dirty && Boolean(block.data))} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
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
