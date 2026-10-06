import type { Metadata } from 'next'
import { AddressBook } from '@/components/account/address-book'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Your addresses', robots: { index: false, follow: false } }
}

export default function Page() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Your addresses</h1>
      <div className="mt-8">
        <AddressBook />
      </div>
    </>
  )
}
