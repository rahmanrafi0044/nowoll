'use client'

import { ACCEPT_ALL, hasAnyTracking, ONLY_NECESSARY, type TrackingIds } from '@nowoll/analytics'
import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { useState } from 'react'
import { useTrackingStore } from '@/stores/tracking-store'

/** "A, B and C" */
const listOf = (parts: string[]) =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`

/** Only the tools this shop actually uses (their IDs are set in Admin → Settings). */
function toolsInUse(ids: TrackingIds) {
  const tools: string[] = []
  if (ids.ga4MeasurementId) tools.push("Google Analytics to see what's popular")
  if (ids.metaPixelId) tools.push('the Meta Pixel (Facebook, Instagram) to measure our ads')
  if (ids.gtmContainerId) tools.push('Google Tag Manager for our marketing tools')
  return {
    sentence: listOf(tools),
    analytics: !!(ids.ga4MeasurementId || ids.gtmContainerId),
    marketing: !!(ids.metaPixelId || ids.gtmContainerId),
  }
}

/**
 * The cookie banner (step 39a). Shown only when the shop uses a tracking tool
 * and the customer hasn't chosen yet — or reopened from "Cookie settings".
 * "Only necessary" is exactly as big and as easy as "Accept all": consent
 * must be freely given (Bangladesh PDPO 2025). Not a pop-up that blocks the
 * page: shopping works without answering.
 *
 * SPEED (step 51): the banner is in the page's HTML from the start (`ids`
 * come from the layout), so a first-time visitor sees it at once instead of
 * after all the JavaScript. For a returning visitor, consentCheckScript() in
 * the layout has already marked <html> before the first paint, and CSS hides
 * this first version (`data-consent-banner="before-load"`); once the saved
 * choice is read, React removes it. No flash either way.
 */
export function ConsentBanner({ ids: layoutIds }: { ids: TrackingIds }) {
  const {
    ids: startedIds,
    consent,
    loaded,
    settingsOpen,
    choose,
    closeSettings,
  } = useTrackingStore()
  const [choosing, setChoosing] = useState(false)
  const ids = startedIds ?? layoutIds

  if (!hasAnyTracking(ids)) return null
  if (loaded && consent && !settingsOpen) return null
  const detailed = choosing || settingsOpen
  const tools = toolsInUse(ids)

  return (
    <section
      aria-labelledby="consent-heading"
      data-consent-banner={loaded ? undefined : 'before-load'}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 text-sm">
        <h2 id="consent-heading" className="text-base font-semibold">
          Cookies
        </h2>
        <p className="text-muted-foreground">
          We use necessary cookies for your bag and checkout. With your OK, we also use{' '}
          {tools.sentence}. You can change this any time with &ldquo;Cookie settings&rdquo; at the
          bottom of the page.{' '}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy policy
          </Link>
        </p>
        {detailed ? (
          <Choices
            key={consent ? `${consent.analytics}-${consent.marketing}` : 'new'}
            initial={consent ?? ONLY_NECESSARY}
            show={tools}
            onSave={choose}
            onClose={settingsOpen && consent ? closeSettings : undefined}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => choose(ACCEPT_ALL)}>
              Accept all
            </Button>
            <Button size="sm" onClick={() => choose(ONLY_NECESSARY)}>
              Only necessary
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChoosing(true)}>
              Choose
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function Choices({
  initial,
  show,
  onSave,
  onClose,
}: {
  initial: { analytics: boolean; marketing: boolean }
  /** Which switches to show (a kind with no tool in use isn't asked about). */
  show: { analytics: boolean; marketing: boolean }
  onSave: (c: { analytics: boolean; marketing: boolean }) => void
  onClose?: () => void
}) {
  const [analytics, setAnalytics] = useState(initial.analytics)
  const [marketing, setMarketing] = useState(initial.marketing)
  const row = 'flex items-start gap-3'
  return (
    <div className="flex flex-col gap-3">
      <label className={row}>
        <input type="checkbox" checked disabled className="mt-1 size-4" />
        <span>
          <strong>Necessary</strong> — your bag, signing in and checkout. Always on.
        </span>
      </label>
      {show.analytics && (
        <label className={row}>
          <input
            type="checkbox"
            checked={analytics}
            onChange={(e) => setAnalytics(e.target.checked)}
            className="mt-1 size-4"
          />
          <span>
            <strong>Analytics</strong> — counting visits and which products are popular.
          </span>
        </label>
      )}
      {show.marketing && (
        <label className={row}>
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="mt-1 size-4"
          />
          <span>
            <strong>Marketing</strong> — measuring which ads bring customers.
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onSave({ analytics, marketing })}>
          Save my choices
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onSave(ACCEPT_ALL)}>
          Accept all
        </Button>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  )
}
