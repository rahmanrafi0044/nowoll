import type { PageLinkView } from '@nowoll/types'
import { localPhone, type PublicSettings, SOCIAL_SITES, whatsappLink } from '@nowoll/validation'
import Link from 'next/link'

// The footer: the store's name and tagline, its contact details and social
// links (Admin → Settings, step 38), order tracking and the published pages
// (Admin → Content → Pages). Only what's filled in is shown.
// Editing the menu itself: step 38b.

type SocialKey = keyof typeof SOCIAL_SITES

// Simple, recognisable outline icons (no third-party scripts or images).
const ICON: Record<SocialKey, string> = {
  social_facebook: 'M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v7h4v-7h3l1-4h-4V8a1 1 0 0 1 1-1z',
  social_instagram:
    'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm5.5-1.5h.01',
  social_tiktok: 'M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 5',
  social_youtube:
    'M21 8.5c0-1.7-1.3-3-3-3H6c-1.7 0-3 1.3-3 3v7c0 1.7 1.3 3 3 3h12c1.7 0 3-1.3 3-3v-7zM10 9.5v5l4.5-2.5L10 9.5z',
}

export function SiteFooter({
  pages,
  settings: s,
}: {
  pages: PageLinkView[]
  settings: PublicSettings
}) {
  const links = [
    { href: '/orders/track', label: 'Track your order' },
    ...pages.map((p) => ({ href: `/${p.slug}`, label: p.title })),
  ]
  const socials = (Object.keys(SOCIAL_SITES) as SocialKey[]).filter((k) => s[k])
  const hasContact =
    s.store_phone || s.store_whatsapp || s.store_email || s.store_address || s.store_hours

  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-lg font-semibold">{s.store_name}</p>
            {s.store_tagline && <p className="text-sm text-muted-foreground">{s.store_tagline}</p>}
          </div>
          {socials.length > 0 && (
            <ul aria-label="Follow us" className="flex gap-3">
              {socials.map((k) => (
                <li key={k}>
                  <a
                    href={s[k]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={SOCIAL_SITES[k].label}
                    className="flex size-9 items-center justify-center rounded-full border border-border hover:bg-surface-muted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={ICON[k]} />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {hasContact && (
          <section aria-label="Contact us" className="text-sm">
            <p className="mb-2 font-semibold">Contact us</p>
            <ul className="flex flex-col gap-1.5 text-muted-foreground">
              {s.store_phone && (
                <li>
                  Phone:{' '}
                  <a href={`tel:${s.store_phone}`} className="hover:text-foreground">
                    {localPhone(s.store_phone)}
                  </a>
                </li>
              )}
              {s.store_whatsapp && (
                <li>
                  WhatsApp:{' '}
                  <a
                    href={whatsappLink(s.store_whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground"
                  >
                    {localPhone(s.store_whatsapp)}
                  </a>
                </li>
              )}
              {s.store_email && (
                <li>
                  Email:{' '}
                  <a href={`mailto:${s.store_email}`} className="hover:text-foreground">
                    {s.store_email}
                  </a>
                </li>
              )}
              {s.store_address && <li className="whitespace-pre-line">{s.store_address}</li>}
              {s.store_hours && <li>{s.store_hours}</li>}
            </ul>
          </section>
        )}
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
        © {new Date().getFullYear()} {s.store_name}. All prices in BDT (৳).
      </p>
    </footer>
  )
}
