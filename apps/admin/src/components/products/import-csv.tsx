'use client'

import type { ProductImportSummary } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { importProductsCsv } from '@/lib/products-api'

// ============================================================================
// CSV import in two steps, so nothing changes by surprise:
//   1. CHECK  — the API reads the whole file and reports what WOULD change
//               (a "dry run"), or every problem with its row number.
//   2. IMPORT — only after that, one button applies it (all rows in one
//               transaction: either everything is saved, or nothing).
// Import never deletes: products missing from the file stay as they are.
// ============================================================================

type Step =
  | { name: 'choose' }
  | { name: 'checked'; file: File; summary: ProductImportSummary }
  | { name: 'done'; summary: ProductImportSummary }

export function ImportCsv() {
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)

  async function check(e: FormEvent) {
    e.preventDefault()
    if (!file) return setProblem({ message: 'Choose a CSV file first.' })
    setBusy(true)
    setProblem(null)
    const r = await importProductsCsv(file, true)
    setBusy(false)
    if (r.ok) setStep({ name: 'checked', file, summary: r.data })
    else setProblem({ message: r.message, details: r.details })
  }

  async function apply(checkedFile: File) {
    setBusy(true)
    setProblem(null)
    const r = await importProductsCsv(checkedFile, false)
    setBusy(false)
    if (r.ok) setStep({ name: 'done', summary: r.data })
    // e.g. someone changed a product in between, so a row no longer fits
    else setProblem({ message: r.message, details: r.details })
  }

  const startOver = () => {
    setStep({ name: 'choose' })
    setFile(null)
    setProblem(null)
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {step.name === 'choose' && (
        <form onSubmit={check} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Start from <span className="font-medium text-foreground">Export CSV</span> on the
            products page, edit it in a spreadsheet, and save it as CSV. Rows are matched by product
            slug and SKU. Nothing is saved until you confirm in the next step.
          </p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
          <Button type="submit" disabled={busy} className="self-start">
            {busy ? 'Checking…' : 'Check file'}
          </Button>
        </form>
      )}

      {step.name === 'checked' && (
        <section aria-labelledby="preview-heading" className="flex flex-col gap-3">
          <h2 id="preview-heading" className="font-semibold">
            {step.file.name}: ready to import
          </h2>
          <p className="text-sm text-muted-foreground">Nothing has been saved yet. This would:</p>
          <SummaryTable summary={step.summary} />
          <div className="flex gap-2">
            <Button disabled={busy || !changes(step.summary)} onClick={() => apply(step.file)}>
              {busy ? 'Importing…' : importLabel(step.summary)}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={startOver}>
              Choose another file
            </Button>
          </div>
          {!changes(step.summary) && (
            <p className="text-sm text-muted-foreground">
              The file matches the shop exactly — there is nothing to import.
            </p>
          )}
        </section>
      )}

      {step.name === 'done' && (
        <section aria-labelledby="done-heading" role="status" className="flex flex-col gap-3">
          <h2 id="done-heading" className="font-semibold">
            Import complete
          </h2>
          <SummaryTable summary={step.summary} />
          <div className="flex gap-2">
            <Link
              href="/admin/products"
              className="text-sm font-medium underline underline-offset-4"
            >
              Back to products
            </Link>
            <Button variant="ghost" size="sm" onClick={startOver}>
              Import another file
            </Button>
          </div>
        </section>
      )}

      {problem && (
        <div role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          <p className="font-medium">{problem.message}</p>
          {problem.details && problem.details.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {problem.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          <p className="mt-2">Fix the file and check it again — nothing was saved.</p>
        </div>
      )}
    </div>
  )
}

function SummaryTable({ summary: s }: { summary: ProductImportSummary }) {
  return (
    <table className="w-full max-w-md text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-1.5 font-medium" />
          <th className="py-1.5 text-right font-medium">New</th>
          <th className="py-1.5 text-right font-medium">Changed</th>
          <th className="py-1.5 text-right font-medium">Unchanged</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {(
          [
            ['products', 'Products'],
            ['variants', 'Variants'],
          ] as const
        ).map(([k, label]) => (
          <tr key={k} className="border-b border-border">
            <th scope="row" className="py-1.5 text-left font-medium">
              {label}
            </th>
            <td className="py-1.5 text-right">{s[k].created}</td>
            <td className="py-1.5 text-right">{s[k].updated}</td>
            <td className="py-1.5 text-right">{s[k].unchanged}</td>
          </tr>
        ))}
        <tr>
          <th scope="row" className="py-1.5 text-left font-medium">
            Stock changes
          </th>
          <td className="py-1.5 text-right" colSpan={3}>
            {s.stockChanges} (each one logged in the inventory history)
          </td>
        </tr>
      </tbody>
    </table>
  )
}

const changes = (s: ProductImportSummary) =>
  s.products.created + s.products.updated + s.variants.created + s.variants.updated + s.stockChanges

function importLabel(s: ProductImportSummary): string {
  const n = s.products.created + s.products.updated
  return n > 0 ? `Import ${n} product${n === 1 ? '' : 's'}` : 'Import changes'
}
