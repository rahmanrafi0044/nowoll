import type { Metadata } from 'next'
import { NewZone } from '@/components/shipping/zone-form'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'New delivery zone' }
}

export default function NewZonePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <NewZone />
    </main>
  )
}
