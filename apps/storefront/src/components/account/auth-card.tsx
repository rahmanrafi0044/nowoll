import type { ReactNode } from 'react'

/** The frame shared by the sign-in, sign-up and password pages. */
export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
      <div className="mt-8">{children}</div>
    </div>
  )
}

export function FormProblem({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
      {message}
    </p>
  )
}

/** A friendly message for any failed call (429 and offline included). */
export function problemText(r: { status: number; message: string }): string {
  if (r.status === 429) return 'Too many tries — please wait a minute and try again.'
  return r.message || 'Something went wrong. Please try again.'
}
