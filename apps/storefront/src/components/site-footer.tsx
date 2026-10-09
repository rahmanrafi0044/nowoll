import type { PageLinkView } from '@nowoll/types'
import Link from 'next/link'

// The footer's links: order tracking, then the pages published in
// Admin → Content → Pages (step 36 part 2) — only pages that exist, so a
// customer never lands on "page not found". Editing the menu itself: step 38b.
export function SiteFooter({ pages }: { pages: PageLinkView[] }) {
  const links = [
    { href: '/orders/track', label: 'Track your order' },
    ...pages.map((p) => ({ href: `/${p.slug}`, label: p.title })),
  ]
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-semibold">Nowoll</p>
          <p className="text-sm text-muted-foreground">always new</p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted-foreground hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Nowoll. All prices in BDT (৳).
      </p>
    </footer>
  )
}
