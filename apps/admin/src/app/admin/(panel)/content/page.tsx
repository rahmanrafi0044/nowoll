import type { Metadata } from 'next'
import Link from 'next/link'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Content' }
}

// Admin → Content (step 36). What the shop shows — see docs/admin-editable.md.
const PARTS = [
  {
    href: '/admin/content/homepage',
    title: 'Homepage',
    text: 'Hero, sections and their order, product rows, banners, trust badges.',
  },
  {
    href: '/admin/content/announcement',
    title: 'Announcement bar',
    text: 'The thin strip above the header — e.g. a sale or free-delivery note.',
  },
  {
    href: '/admin/content/pages',
    title: 'Pages',
    text: 'Privacy, terms, return policy, about, contact, FAQ — written here, shown in the footer.',
  },
]

export default function ContentPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Content</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        What customers see on the shop. Changes appear within a minute.
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {PARTS.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="block rounded-lg border border-border bg-surface p-5 hover:border-border-strong"
            >
              <span className="font-semibold">{p.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{p.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
