import {
  allowedTargets,
  type Consent,
  CONSENT_STORAGE_KEY,
  cookieDomains,
  hasAnyTracking,
  installGa4,
  installGtm,
  installPixel,
  isWithdrawal,
  NO_TARGETS,
  parseConsent,
  readMetaCookies,
  sendEvent,
  serializeConsent,
  type TrackEvent,
  type TrackingIds,
  type TrackingTargets,
  type TrackingWindow,
  trackingCookiesToRemove,
} from '@nowoll/analytics'
import { create } from 'zustand'

// ============================================================================
// Tracking in the shop (step 39a). Pages call track(event) whenever something
// happens ("added to bag"); this store decides whether it may go anywhere:
//   • before the customer has chosen → the event waits (at most 20),
//   • they accept → the allowed tools start, then the waiting events are sent,
//   • they refuse (or no IDs are set) → the events are dropped.
// The tools' start-up code runs here; <TrackingScripts> then loads their
// script files. The choice is saved in this browser only (localStorage).
// ============================================================================

const MAX_WAITING = 20

/** The page reload, in an object so tests can replace it (jsdom can't reload). */
export const page = { reload: () => location.reload() }

interface TrackingState {
  /** IDs from Admin → Settings; null until the layout's <TrackingScripts> starts us. */
  ids: TrackingIds | null
  /** The customer's saved choice; null = not chosen yet. */
  consent: Consent | null
  /** Has the saved choice been read? (Only possible in the browser, after the first render.) */
  loaded: boolean
  /** "Cookie settings" opened from the footer. */
  settingsOpen: boolean
  /** Tools started on this page. */
  targets: TrackingTargets
  waiting: TrackEvent[]
  start: (ids: TrackingIds) => void
  choose: (consent: Consent) => void
  openSettings: () => void
  closeSettings: () => void
}

const win = () => window as unknown as TrackingWindow

function readSaved(): Consent | null {
  try {
    return parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY))
  } catch {
    return null // storage blocked (private mode) → ask again
  }
}

function save(consent: Consent) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(consent, new Date()))
  } catch {
    // storage blocked → the choice still holds for this visit
  }
}

/** Remove the refused tools' cookies (they were set on our domain, so we can). */
function removeCookies(consent: Consent) {
  const names = document.cookie
    .split(';')
    .map((c) => c.split('=')[0]!.trim())
    .filter(Boolean)
  for (const name of trackingCookiesToRemove(names, consent)) {
    const expired = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    document.cookie = expired
    for (const domain of cookieDomains(location.hostname))
      document.cookie = `${expired}; domain=${domain}`
  }
}

export const useTrackingStore = create<TrackingState>()((set, get) => {
  /** Start the tools the customer allowed (each only once), then send what was waiting. */
  function activate() {
    const { ids, consent, targets, waiting } = get()
    if (!ids) return
    if (!consent) {
      // Nothing to ask about → nothing will ever be sent.
      if (!hasAnyTracking(ids)) set({ waiting: [] })
      return
    }
    const next = allowedTargets(consent, ids)
    if (next.ga4 && !targets.ga4) installGa4(win(), ids.ga4MeasurementId)
    if (next.gtm && !targets.gtm) installGtm(win(), Date.now())
    if (next.pixel && !targets.pixel) installPixel(win(), ids.metaPixelId)
    for (const event of waiting) sendEvent(win(), next, event)
    set({ targets: next, waiting: [] })
  }

  return {
    ids: null,
    consent: null,
    loaded: false,
    settingsOpen: false,
    targets: NO_TARGETS,
    waiting: [],

    start(ids) {
      set({ ids, consent: readSaved(), loaded: true })
      activate()
    },

    choose(consent) {
      const before = get().consent
      save(consent)
      set({ consent, settingsOpen: false })
      if (isWithdrawal(before, consent)) {
        // A started script can't be stopped — remove its cookies and reload without it.
        removeCookies(consent)
        page.reload()
        return
      }
      activate()
    },

    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),
  }
})

/** Send a shopping event to every tool the customer allowed (or keep it until they choose). */
export function track(event: TrackEvent): void {
  const s = useTrackingStore.getState()
  const undecided = !s.loaded || (!s.consent && (!s.ids || hasAnyTracking(s.ids)))
  if (undecided) {
    useTrackingStore.setState({ waiting: [...s.waiting, event].slice(-MAX_WAITING) })
    return
  }
  sendEvent(win(), s.targets, event)
}

/**
 * Step 39b: what the order request carries for Meta's server events — ONLY
 * when the customer allowed Marketing and the shop uses the Pixel. Otherwise
 * nothing, and the server stores and sends nothing for this order.
 */
export function orderTrackingPart(): { marketing: true; fbp?: string; fbc?: string } | undefined {
  const { consent, ids } = useTrackingStore.getState()
  if (!consent?.marketing || !ids?.metaPixelId) return undefined
  let cookies = ''
  try {
    cookies = document.cookie
  } catch {
    // no cookies readable → still consent, just no Meta cookies
  }
  return { marketing: true, ...readMetaCookies(cookies) }
}
