'use client'

import { Button, Input } from '@nowoll/ui'
import Image from 'next/image'
import { useId, useState } from 'react'
import { imageFileProblem } from '@/components/product-edit/images-section'
import type { ApiCallResult } from '@/lib/api'
import { uploadContentImage } from '@/lib/content-api'

// Shared pieces of the content editors (step 36).

/** A picture: upload (checked here AND by the API), preview, remove. */
export function ImageField({
  label,
  url,
  onChange,
  required = false,
  upload = uploadContentImage,
  hint,
}: {
  label: string
  url: string | null
  onChange: (url: string | null) => void
  required?: boolean
  /** Where the file goes (default: the homepage pictures upload). Only the address is needed. */
  upload?: (file: File) => Promise<ApiCallResult<{ url: string }>>
  /** Extra advice under the field, e.g. the best size. */
  hint?: string
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)

  async function pick(file: File | undefined) {
    if (!file) return
    const p = imageFileProblem(file)
    if (p) return setProblem(p)
    setBusy(true)
    setProblem(null)
    const r = await upload(file)
    setBusy(false)
    setInputKey((k) => k + 1)
    if (!r.ok) return setProblem(r.message)
    onChange(r.data.url)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-muted-foreground"> (required)</span>}
      </label>
      {url && (
        <div className="flex items-center gap-3">
          <Image
            src={url}
            alt=""
            width={160}
            height={90}
            className="h-[90px] w-[160px] rounded-control object-cover"
          />
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove picture
          </Button>
        </div>
      )}
      <input
        key={inputKey}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-describedby={`${id}-hint`}
        disabled={busy}
        className="text-sm"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <span id={`${id}-hint`} className="text-xs text-muted-foreground">
        {busy
          ? 'Uploading…'
          : `JPEG, PNG or WebP, up to 5 MB.${hint ? ` ${hint}` : ''}${url ? ' Choosing a file replaces the picture.' : ''}`}
      </span>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
    </div>
  )
}

/** A link field with the rule spelled out: an address on this shop, or a full https link. */
export function LinkInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Input
      label={label}
      value={value}
      maxLength={300}
      placeholder="/shop/men"
      onChange={(e) => onChange(e.target.value)}
      hint="A page on this shop, starting with / (e.g. /shop/men), or a full https:// link. Empty = no link."
    />
  )
}

/** The API's list of problems (each line: where › what). */
export function SaveProblems({
  problem,
}: {
  problem: { message: string; details?: string[] } | null
}) {
  if (!problem) return null
  return (
    <div role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
      <p className="font-medium">{problem.message}</p>
      {problem.details && problem.details.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {problem.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const LIVE_NOTE = 'Saved. The shop shows it within a minute.'
