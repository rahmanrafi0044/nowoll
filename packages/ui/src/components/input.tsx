import { type ComponentPropsWithRef, useId } from 'react'
import { cn } from '../cn.js'

export interface InputProps extends ComponentPropsWithRef<'input'> {
  label: string // required: every input needs a visible label (accessibility)
  hint?: string
  error?: string
}

// ACCESSIBILITY wiring, so screen readers announce everything:
//   <label for>          → the input's name is read aloud on focus
//   aria-invalid         → "invalid entry" is announced when there's an error
//   aria-describedby     → the hint or error text is read after the label
export function Input({ label, hint, error, id, className, ...props }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          // text-base (16px): smaller text makes iPhones zoom in on focus
          'h-11 rounded-control border bg-surface px-3 text-base text-foreground',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
          'disabled:cursor-not-allowed disabled:bg-surface-muted',
          error ? 'border-danger' : 'border-border-strong',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
