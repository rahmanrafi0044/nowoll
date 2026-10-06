import type { Metadata } from 'next'
import { Dashboard } from '@/components/dashboard/dashboard'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Dashboard' }
}

// Shown only after the API confirms a staff role + 2FA (components/admin-shell.tsx).
// The numbers load in the browser — see components/dashboard/dashboard.tsx.
export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <Dashboard />
    </main>
  )
}
