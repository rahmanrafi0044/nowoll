import type { Metadata } from 'next'
import { WishlistPage } from '@/components/account/wishlist-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Your wishlist', robots: { index: false, follow: false } }
}

export default function Page() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Your wishlist</h1>
      <div className="mt-8">
        <WishlistPage />
      </div>
    </>
  )
}
