import type { Metadata } from 'next'
import { SettingsPage } from '@/components/settings/settings-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Settings' }
}

export default function AdminSettingsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SettingsPage />
    </main>
  )
}
