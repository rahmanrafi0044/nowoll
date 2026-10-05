import { NewsletterForm } from './newsletter-form'

export function NewsletterSection() {
  return (
    <section aria-labelledby="newsletter" className="bg-surface-muted">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-14 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="newsletter" className="text-2xl font-semibold tracking-tight">
            Be first to see what&apos;s new
          </h2>
          <p className="mt-2 text-muted-foreground">
            New arrivals and offers, a few times a month. No spam.
          </p>
        </div>
        <NewsletterForm />
      </div>
    </section>
  )
}
