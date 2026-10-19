import { ACCEPT_ALL, CONSENT_STORAGE_KEY, serializeConsent } from '@nowoll/analytics'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useTrackingStore } from '@/stores/tracking-store'
import { ConsentBanner } from './consent-banner'
import { CookieSettingsButton } from './cookie-settings-button'

const initial = useTrackingStore.getState()
const IDS = { ga4MeasurementId: 'G-AB12CD34EF', gtmContainerId: '', metaPixelId: '123456789012' }

function start(ids = IDS) {
  act(() => useTrackingStore.getState().start(ids))
}

beforeEach(() => {
  useTrackingStore.setState(initial, true)
  localStorage.clear()
  const w = window as unknown as Record<string, unknown>
  for (const k of ['dataLayer', 'gtag', 'fbq', '_fbq']) delete w[k]
})

describe('<ConsentBanner /> (step 39a)', () => {
  it('shows nothing when the shop uses no tracking tool', () => {
    const none = { ga4MeasurementId: '', gtmContainerId: '', metaPixelId: '' }
    render(<ConsentBanner ids={none} />)
    start(none)
    expect(screen.queryByRole('region', { name: 'Cookies' })).toBeNull()
  })

  it('asks first, naming only the tools in use, with refusing as easy as accepting', () => {
    render(<ConsentBanner ids={IDS} />)
    start()
    const banner = screen.getByRole('region', { name: 'Cookies' })
    expect(banner).toHaveTextContent('Google Analytics')
    expect(banner).toHaveTextContent('Meta Pixel')
    expect(banner).not.toHaveTextContent('Tag Manager')
    const accept = screen.getByRole('button', { name: 'Accept all' })
    const refuse = screen.getByRole('button', { name: 'Only necessary' })
    expect(refuse.className).toBe(accept.className) // same size and look
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy')
  })

  it('"Only necessary" saves the choice and closes', () => {
    render(<ConsentBanner ids={IDS} />)
    start()
    fireEvent.click(screen.getByRole('button', { name: 'Only necessary' }))
    expect(screen.queryByRole('region', { name: 'Cookies' })).toBeNull()
    expect(useTrackingStore.getState().consent).toEqual({ analytics: false, marketing: false })
  })

  it('"Choose": per-kind switches, all off until ticked', () => {
    render(<ConsentBanner ids={IDS} />)
    start()
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
    expect(screen.getByRole('checkbox', { name: /Necessary/ })).toBeDisabled()
    const analytics = screen.getByRole('checkbox', { name: /Analytics/ })
    expect(analytics).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Marketing/ })).not.toBeChecked()
    fireEvent.click(analytics)
    fireEvent.click(screen.getByRole('button', { name: 'Save my choices' }))
    expect(useTrackingStore.getState().consent).toEqual({ analytics: true, marketing: false })
  })

  it('a kind with no tool in use is not asked about', () => {
    render(<ConsentBanner ids={IDS} />)
    start({ ga4MeasurementId: 'G-AB12CD34EF', gtmContainerId: '', metaPixelId: '' })
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
    expect(screen.getByRole('checkbox', { name: /Analytics/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Marketing/ })).toBeNull()
  })

  it('stays hidden after a choice; "Cookie settings" reopens it with that choice', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(ACCEPT_ALL, new Date()))
    render(
      <>
        <ConsentBanner ids={IDS} />
        <CookieSettingsButton />
      </>,
    )
    start()
    expect(screen.queryByRole('region', { name: 'Cookies' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }))
    expect(screen.getByRole('checkbox', { name: /Analytics/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Marketing/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Cookies' })).toBeNull()
  })

  it('is in the page before the saved choice is read (speed, step 51) — marked so CSS can hide it', () => {
    render(<ConsentBanner ids={IDS} />)
    const banner = screen.getByRole('region', { name: 'Cookies' })
    expect(banner).toHaveAttribute('data-consent-banner', 'before-load')
    start()
    // Read: nothing saved → still asking, now as the normal banner.
    expect(screen.getByRole('region', { name: 'Cookies' })).not.toHaveAttribute(
      'data-consent-banner',
    )
  })

  it('a returning visitor: the early banner is removed once their saved choice is read', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, serializeConsent(ACCEPT_ALL, new Date()))
    render(<ConsentBanner ids={IDS} />)
    start()
    expect(screen.queryByRole('region', { name: 'Cookies' })).toBeNull()
  })
})
