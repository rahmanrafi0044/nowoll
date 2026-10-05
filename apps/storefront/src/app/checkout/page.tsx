import type { Metadata } from 'next'
import { CheckoutFlow } from '@/components/checkout/checkout-flow'

// Spec: "Checkout — Server (auth optional)". The page shell is server-rendered;
// the steps run in the browser because the bag lives there. Guest checkout
// only for now — customer accounts arrive in Phase 4.
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Checkout', robots: { index: false, follow: false } }
}

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      <div className="mt-6">
        <CheckoutFlow />
      </div>
    </div>
  )
}
