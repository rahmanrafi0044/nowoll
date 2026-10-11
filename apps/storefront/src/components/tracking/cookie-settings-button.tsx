'use client'

import { useTrackingStore } from '@/stores/tracking-store'

/** "Cookie settings" in the footer: reopens the banner so the customer can change their choice. */
export function CookieSettingsButton() {
  const openSettings = useTrackingStore((s) => s.openSettings)
  return (
    <button
      type="button"
      onClick={openSettings}
      className="underline-offset-4 hover:text-foreground hover:underline"
    >
      Cookie settings
    </button>
  )
}
