import type { StoreSettings } from '@nowoll/validation'
import { call } from '@/lib/api'

// Admin → Settings (step 38, part 1) — apps/api/src/settings.

export const fetchSettings = () => call<StoreSettings>('GET', '/admin/settings')

/** Only the settings sent change; the API checks each with SETTINGS_SCHEMA. */
export const saveSettings = (values: Partial<StoreSettings>) =>
  call<StoreSettings>('PATCH', '/admin/settings', { values })
