import type { Metadata } from 'next'

// CLAUDE.md §13: every page exports generateMetadata().
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: 'Nowoll — always new' },
    alternates: { canonical: '/' },
  }
}

// Placeholder homepage. The real one (hero, categories, featured products,
// new arrivals) is built in Phase 2 step 12.
export default function HomePage() {
  return (
    <section className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Nowoll</h1>
      <p className="mt-3 text-lg text-neutral-500">always new</p>
    </section>
  )
}
