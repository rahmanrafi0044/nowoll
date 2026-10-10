import type { Metadata } from 'next'
import { ZoneList } from '@/components/shipping/zone-list'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Shipping' }
}

export default function ShippingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ZoneList />
    </main>
  )
}
