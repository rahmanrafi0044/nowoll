// The shop's line icons (38f) — one stroke weight, decorative only: every
// button or link that uses one also has a text name for screen readers.
import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>) => ({
  'aria-hidden': true as const,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'size-5',
  ...props,
})

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
)
export const UserIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" />
  </svg>
)
export const HeartIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
  </svg>
)
export const BagIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5.5 8h13l-1 12h-11l-1-12z" />
    <path d="M9 8V6.5a3 3 0 016 0V8" />
  </svg>
)
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
)
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ className: 'size-3.5', ...p })}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)
export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ className: 'size-4', ...p })}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
