import type { Metadata } from 'next'
import { StaffPage } from '@/components/staff/staff-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Staff' }
}

export default function AdminStaffPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <StaffPage />
    </main>
  )
}
