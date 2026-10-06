import type { Metadata } from 'next'
import { SignInFlow } from '@/components/sign-in/sign-in-flow'
import { safeNextPath } from '@/lib/admin-access'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Sign in' }
}

// In Next.js 16, searchParams is a Promise.
type Props = { searchParams: Promise<{ error?: string; next?: string }> }

export default async function LoginPage({ searchParams }: Props) {
  const { error, next } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Nowoll Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to manage your store.</p>

        {error === 'forbidden' && (
          <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            This account doesn’t have admin access, or has been disabled.
          </p>
        )}

        {/* safeNextPath: only our own /admin/* pages — never an outside site. */}
        <SignInFlow next={safeNextPath(next)} />
      </div>
    </main>
  )
}
