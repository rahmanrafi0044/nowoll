import type { HomepageSection, TrustBadgeIcon } from '@nowoll/validation'

type Badges = Extract<HomepageSection, { type: 'trust_badges' }>['badges']

/**
 * Up to 4 short promises ("Cash on delivery", "7-day returns") with an icon
 * from a FIXED set drawn here — the admin picks a name, never uploads or
 * pastes anything (docs/admin-editable.md: no HTML from the admin panel).
 */
export function TrustBadges({ id, badges }: { id: string; badges: Badges }) {
  return (
    <section
      aria-label="Why shop with us"
      id={id}
      className="border-y border-border bg-surface-muted"
    >
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 lg:grid-cols-4">
        {badges.map((b, i) => (
          <li key={`${b.icon}-${i}`} className="flex items-center gap-3 text-sm font-medium">
            <Icon name={b.icon} />
            {b.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

// Simple 24×24 line icons (stroke = the text colour), hidden from screen readers:
// the text next to them says it all.
const PATHS: Record<TrustBadgeIcon, string> = {
  truck: 'M3 6h11v9H3zM14 9h4l3 3v3h-7zM7 18a1.5 1.5 0 1 0 0-.01M17 18a1.5 1.5 0 1 0 0-.01',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M6 10v4M18 10v4',
  return: 'M9 7 5 11l4 4M5 11h10a4 4 0 0 1 0 8h-2',
  shield: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6zM9 12l2 2 4-4',
  phone: 'M7 3h10v18H7zM11 18h2',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
}

function Icon({ name }: { name: TrustBadgeIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
