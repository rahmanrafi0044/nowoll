import type { Metadata } from 'next'
import { ProfileSettings } from '@/components/account/profile-settings'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Your profile', robots: { index: false, follow: false } }
}

export default function Page() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
      <div className="mt-8">
        <ProfileSettings />
      </div>
    </>
  )
}
