import Link from 'next/link'
import type { ComponentProps } from 'react'
import type { NavLink } from '@/lib/navigation'

/** A menu / footer link: a page on this shop, or another site in a new tab. */
export function NavAnchor({
  link,
  ...props
}: { link: NavLink } & Omit<ComponentProps<'a'>, 'href'>) {
  if (link.external)
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" {...props}>
        {link.label}
      </a>
    )
  return (
    <Link href={link.href} {...props}>
      {link.label}
    </Link>
  )
}
