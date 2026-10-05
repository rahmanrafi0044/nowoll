'use client'

const MAX_QTY = 10 // same typo guard as the product page (decision #6)

// "− 2 +" control. The number is announced, and each button names the product
// it changes, so screen-reader users know which line they're on.
export function QuantityStepper({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: number
  onChange: (next: number) => void
  label: string
  disabled?: boolean
}) {
  const button =
    'flex size-9 items-center justify-center text-lg hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand'
  return (
    <div
      className="inline-flex items-center rounded-control border border-border-strong"
      role="group"
      aria-label={`Quantity of ${label}`}
    >
      <button
        type="button"
        className={button}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 1}
        aria-label={`Decrease quantity of ${label}`}
      >
        −
      </button>
      <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= MAX_QTY}
        aria-label={`Increase quantity of ${label}`}
      >
        +
      </button>
    </div>
  )
}
