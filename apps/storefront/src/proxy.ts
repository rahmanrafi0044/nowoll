import { type NextRequest, NextResponse } from 'next/server'
import { redirectFor } from '@/lib/redirects'

// Next.js Proxy (step 43c): runs before a PAGE is shown, and sends visitors
// from an old web address to its new one (301 = moved for good, 302 = for
// now). Rules: lib/redirects.ts. Never for files, images or Next.js internals
// (the matcher below), nor for checkout, cart, account… (the shared rules).
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const to = await redirectFor(pathname, search)
  if (!to) return NextResponse.next()
  return NextResponse.redirect(new URL(to.location, request.url), to.permanent ? 301 : 302)
}

export const config = {
  matcher: [
    // Pages only: not Next.js files, not images, not anything with a file extension (.png, .xml…).
    '/((?!_next/|api/|.*\\.[a-zA-Z0-9]+$).*)',
  ],
}
