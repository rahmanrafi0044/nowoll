import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Sign in' }
}

// In Next.js 16, searchParams is a Promise.
type Props = { searchParams: Promise<{ error?: string }> }

// PLACEHOLDER: the real sign-in form (email + password + 2FA code) is built in
// Phase 4 together with the auth API. Until then nobody can sign in, and the
// proxy keeps every other admin page locked.
export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Nowoll Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to manage your store.</p>

        {error === 'forbidden' && (
          <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            Your account doesn’t have admin access, or two-factor authentication isn’t complete.
          </p>
        )}

        <p className="mt-6 rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
          Sign-in is coming in Phase 4.
        </p>
      </div>
    </main>
  )
}
