'use client'

import {
  ga4ScriptUrl,
  gtmScriptUrl,
  PIXEL_SCRIPT_URL,
  trackPageView,
  type TrackingIds,
  type TrackingWindow,
} from '@nowoll/analytics'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef } from 'react'
import { useTrackingStore } from '@/stores/tracking-store'

/**
 * Loads Google Analytics, Google Tag Manager and the Meta Pixel — each only
 * when its ID is set in Admin → Settings AND the customer agreed (step 39a,
 * docs/integrations/analytics.md). The IDs were checked against their
 * official formats when saved, and the script addresses are fixed here, so
 * nothing typed in the admin can become code on the page (CLAUDE.md Rule 9).
 */
export function TrackingScripts({ ids }: { ids: TrackingIds }) {
  const start = useTrackingStore((s) => s.start)
  const targets = useTrackingStore((s) => s.targets)
  const { ga4MeasurementId, gtmContainerId, metaPixelId } = ids
  useEffect(
    () => start({ ga4MeasurementId, gtmContainerId, metaPixelId }),
    [start, ga4MeasurementId, gtmContainerId, metaPixelId],
  )

  // The Pixel counts the first page itself when it starts; later page changes
  // happen without a reload, so we tell it. (GA4 notices them on its own.)
  const pathname = usePathname()
  const pixelPath = useRef<string | null>(null)
  useEffect(() => {
    if (!targets.pixel) return
    if (pixelPath.current === null) pixelPath.current = pathname
    else if (pixelPath.current !== pathname) {
      pixelPath.current = pathname
      trackPageView(window as unknown as TrackingWindow, targets)
    }
  }, [pathname, targets])

  return (
    <>
      {targets.ga4 && <Script id="ga4" src={ga4ScriptUrl(ga4MeasurementId)} />}
      {targets.gtm && <Script id="gtm" src={gtmScriptUrl(gtmContainerId)} />}
      {targets.pixel && <Script id="meta-pixel" src={PIXEL_SCRIPT_URL} />}
    </>
  )
}
