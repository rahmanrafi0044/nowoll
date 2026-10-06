/** ★★★★☆ — read out as "4 out of 5 stars" (the characters themselves are hidden from screen readers). */
export function Stars({ value, className = '' }: { value: number; className?: string }) {
  const full = Math.round(value)
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className={`text-warning ${className}`}>
      <span aria-hidden="true">
        {'★'.repeat(full)}
        <span className="text-border-strong">{'★'.repeat(5 - full)}</span>
      </span>
    </span>
  )
}
