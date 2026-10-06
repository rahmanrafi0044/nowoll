import type { Metadata } from 'next'
import { AccountOverview } from '@/components/account/account-overview'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Your account', robots: { index: false, follow: false } }
}

export default function AccountPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
      <div className="mt-8">
        <AccountOverview />
      </div>
    </>
  )
}
