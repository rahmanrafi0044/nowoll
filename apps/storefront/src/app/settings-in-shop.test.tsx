import { publicSettings, SETTING_DEFAULTS } from '@nowoll/validation'
import { render, screen, within } from '@testing-library/react'
import { SiteFooter } from '@/components/site-footer'
import { generateMetadata } from './layout'

// Step 38: what Admin → Settings changes on the shop.
const responses = new Map<string, unknown>()
vi.mock('@/lib/api', () => ({
  apiGet: vi.fn((path: string) => Promise.resolve(responses.get(path) ?? null)),
}))

const settings = (patch: object = {}) => ({ ...publicSettings(SETTING_DEFAULTS), ...patch })

beforeEach(() => responses.clear())

describe('footer', () => {
  it('name, tagline, contact details and social links — phone and WhatsApp as people write them', () => {
    render(
      <SiteFooter
        pages={[]}
        settings={settings({
          store_name: 'Nowoll BD',
          store_tagline: 'fresh every week',
          store_phone: '+8801712345678',
          store_whatsapp: '+8801812345678',
          store_email: 'hello@nowoll.com',
          store_address: 'House 12, Road 5\nDhanmondi, Dhaka',
          store_hours: 'Sat–Thu, 10 am – 8 pm',
          social_facebook: 'https://www.facebook.com/nowoll',
          social_youtube: 'https://youtube.com/@nowoll',
        })}
      />,
    )
    expect(screen.getByText('fresh every week')).toBeInTheDocument()
    expect(screen.getByText(/© \d{4} Nowoll BD\./)).toBeInTheDocument()
    const contact = within(screen.getByRole('region', { name: 'Contact us' }))
    expect(contact.getByRole('link', { name: '01712345678' })).toHaveAttribute(
      'href',
      'tel:+8801712345678',
    )
    const wa = contact.getByRole('link', { name: '01812345678' })
    expect(wa).toHaveAttribute('href', 'https://wa.me/8801812345678')
    expect(wa).toHaveAttribute('rel', 'noopener noreferrer')
    expect(contact.getByRole('link', { name: 'hello@nowoll.com' })).toHaveAttribute(
      'href',
      'mailto:hello@nowoll.com',
    )
    expect(contact.getByText(/Sat–Thu/)).toBeInTheDocument()
    const social = within(screen.getByRole('list', { name: 'Follow us' }))
    expect(social.getAllByRole('link').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Facebook',
      'YouTube',
    ])
    expect(social.getByRole('link', { name: 'Facebook' })).toHaveAttribute('target', '_blank')
  })

  it('nothing filled in → no contact block, no social icons (nothing empty is shown)', () => {
    render(<SiteFooter pages={[]} settings={settings({ store_tagline: '' })} />)
    expect(screen.queryByRole('region', { name: 'Contact us' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Follow us' })).toBeNull()
    expect(screen.getByText(/© \d{4} Nowoll\./)).toBeInTheDocument()
  })
})

describe('site-wide Google defaults', () => {
  it('from settings: the title, "| name" on every page, the description', async () => {
    responses.set(
      '/settings/public',
      settings({
        store_name: 'Nowoll BD',
        seo_title: 'Nowoll BD — Panjabi & Kurti',
        seo_description: 'Eid collection is here.',
      }),
    )
    expect(await generateMetadata()).toMatchObject({
      title: { default: 'Nowoll BD — Panjabi & Kurti', template: '%s | Nowoll BD' },
      description: 'Eid collection is here.',
      applicationName: 'Nowoll BD',
      openGraph: { siteName: 'Nowoll BD' },
    })
  })

  it('the API unreachable (e.g. during the build) → today’s defaults', async () => {
    expect(await generateMetadata()).toMatchObject({
      title: { default: 'Nowoll — always new', template: '%s | Nowoll' },
    })
  })
})
