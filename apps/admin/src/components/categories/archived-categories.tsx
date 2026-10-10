'use client'

import { Button } from '@nowoll/ui'
import { useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { fetchArchivedCategories, restoreCategory } from '@/lib/categories-api'
import { formatInstantDate } from '@/lib/date'

/** Archived categories (soft-deleted) — restore brings one back, HIDDEN. */
export function ArchivedCategories() {
  const { state, retry, refresh } = useLoad(fetchArchivedCategories)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function restore(id: string, name: string) {
    setBusy(id)
    setNote(null)
    const r = await restoreCategory(id)
    setBusy(null)
    if (!r.ok) return setNote({ ok: false, text: r.message })
    setNote({
      ok: true,
      text: `${name} is back, hidden. Switch on “Show on the shop” in Categories when it’s ready.`,
    })
    refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Archived categories</h1>
      {note && (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={`text-sm ${note.ok ? 'text-success' : 'text-danger'}`}
        >
          {note.text}
        </p>
      )}
      <Panel title="Archived" state={state} retry={retry}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing archived.</p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 border-b border-border py-2.5"
                >
                  <span className="mr-auto">
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      /shop/{c.slug} · archived {formatInstantDate(c.archivedAt)}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void restore(c.id, c.name)}
                  >
                    {busy === c.id ? 'Restoring…' : `Restore ${c.name}`}
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </Panel>
    </div>
  )
}
