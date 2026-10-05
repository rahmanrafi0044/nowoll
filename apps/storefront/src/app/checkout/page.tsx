import type { Metadata } from 'next'
import { CheckoutFlow } from '@/components/checkout/checkout-flow'

// Spec: "Checkout — Server (auth optional)". The page shell is server-rendered;
// the steps run in the browser because the bag lives there. Guest checkout
// only for now — customer accounts arrive in Phase 4.
export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Checkout', robots: { index: false, follow: false } }
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string | string[] }>
}) {
  // ?payment=error: the API couldn't match the customer's return from
  // SSLCommerz to an order (see PaymentsService.handleRedirect).
  const { payment } = await searchParams
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      {payment === 'error' && (
        <p role="alert" className="mt-4 rounded-control bg-danger-soft p-3 text-sm text-danger">
          Something went wrong on the way back from the payment page. If money was taken from your
          account, please don&apos;t pay again — contact us with your order number and we&apos;ll
          sort it out.
        </p>
      )}
      <div className="mt-6">
        <CheckoutFlow />
      </div>
    </div>
  )
}
