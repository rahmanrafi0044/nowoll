import { type ComponentPropsWithRef, type ReactNode, useId } from 'react'

// Form controls the shared design system doesn't have yet (it has Input).
// Same accessibility wiring as @nowoll/ui's Input: a real <label>, and hints
// and counters read out after the label via aria-describedby.

const control =
  'rounded-control border border-border-strong bg-surface px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:bg-surface-muted'

export function TextArea({
  label,
  hint,
  maxLength,
  value,
  ...props
}: ComponentPropsWithRef<'textarea'> & { label: string; hint?: string; value: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        aria-describedby={`${id}-hint`}
        className={`${control} min-h-24 py-2`}
        {...props}
      />
      <p id={`${id}-hint`} className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{hint}</span>
        {maxLength && (
          <span className="tabular-nums">
            {value.length} / {maxLength}
          </span>
        )}
      </p>
    </div>
  )
}

export function SelectField({
  label,
  hint,
  children,
  ...props
}: ComponentPropsWithRef<'select'> & { label: string; hint?: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`${control} h-11`}
        {...props}
      >
        {children}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A form-level problem (from the API, or a check before sending). */
export function FormProblem({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
      {message}
    </p>
  )
}
