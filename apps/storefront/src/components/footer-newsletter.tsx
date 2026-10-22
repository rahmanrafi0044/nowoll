'use client'

import { usePathname } from 'next/navigation'
import { NewsletterForm } from './home/newsletter-form'

/**
 * The footer's newsletter sign-up (step 42) — ONE sign-up box per page (38f):
 * on the homepage, when its own big "Newsletter sign-up" section is showing
 * (Admin → Content → Homepage), this footer copy steps aside. Every other
 * page keeps it.
 */
export function FooterNewsletter({ hideOnHome }: { hideOnHome: boolean }) {
  const pathname = usePathname()
  if (hideOnHome && pathname === '/') return null
  return (
    <section
      aria-labelledby="footer-newsletter"
      className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pb-8 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p id="footer-newsletter" className="font-display text-lg">
          Get new arrivals by email
        </p>
        <p className="text-sm text-muted-foreground">A few times a month. No spam.</p>
      </div>
      <NewsletterForm source="footer" label="Your email for the newsletter" />
    </section>
  )
}
