import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Dashboard' }
}

// PLACEHOLDER: KPI cards, revenue chart and low-stock alerts arrive in Phase 5.
// Only reachable once the proxy confirms a staff role + 2FA.
export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Store overview arrives in Phase 5.</p>
    </main>
  )
}
