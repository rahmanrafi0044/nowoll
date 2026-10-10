import { type PublicSettings, publicSettings, SETTING_DEFAULTS } from '@nowoll/validation'
import { cache } from 'react'
import { apiGet } from '@/lib/api'

/**
 * The shop's public settings from Admin → Settings (step 38): name, tagline,
 * contact details, social links, shop-page defaults, thank-you message,
 * Google defaults. Cached for 60 s like every API read (ISR) and shared by
 * everything on one page (React cache). If the API can't be reached (e.g.
 * during `next build`), today's defaults are used — the shop never breaks.
 */
export const getSettings = cache(
  async (): Promise<PublicSettings> =>
    (await apiGet<PublicSettings>('/settings/public')) ?? publicSettings(SETTING_DEFAULTS),
)

/** "Nowoll — always new" (or just the name when there's no tagline). */
export const siteTitle = (s: Pick<PublicSettings, 'store_name' | 'store_tagline'>) =>
  s.store_tagline ? `${s.store_name} — ${s.store_tagline}` : s.store_name
