'use client'

import { Button, Input } from '@nowoll/ui'
import {
  localPhone,
  SETTINGS_SCHEMA,
  type SettingKey,
  SHOP_PAGE_SIZES,
  SOCIAL_SITES,
  type StoreSettings,
} from '@nowoll/validation'
import { type ReactNode, useEffect, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { SelectField, TextArea } from '@/components/form-fields'
import { fetchSettings, saveSettings } from '@/lib/settings-api'

// ============================================================================
// Admin → Settings (step 38, part 1): the shop's details and business rules,
// one page. Only what changed is sent; the API checks every value with the
// same SETTINGS_SCHEMA used here. Developer-side (docs/admin-editable.md):
// the currency and the email sender address.
// ============================================================================

const LABEL: Record<SettingKey, string> = {
  store_name: 'Store name',
  store_tagline: 'Tagline',
  store_email: 'Email',
  store_phone: 'Phone',
  store_whatsapp: 'WhatsApp number',
  store_address: 'Address',
  store_hours: 'Opening hours',
  social_facebook: 'Facebook page',
  social_instagram: 'Instagram',
  social_tiktok: 'TikTok',
  social_youtube: 'YouTube',
  vat_rate: 'VAT (%)',
  return_window_days: 'Return window (days)',
  low_stock_threshold: 'Low-stock limit',
  payment_timeout_minutes: 'Unpaid online orders cancel after (minutes)',
  admin_notification_email: 'Admin alert email',
  shop_page_size: 'Products per page',
  shop_default_sort: 'Default sort',
  thank_you_message: 'Thank-you message',
  seo_title: 'Google title',
  seo_description: 'Google description',
}

const NUMBER_KEYS = new Set<SettingKey>([
  'vat_rate',
  'return_window_days',
  'low_stock_threshold',
  'payment_timeout_minutes',
  'shop_page_size',
])
const PHONE_KEYS = new Set<SettingKey>(['store_phone', 'store_whatsapp'])

type Form = Record<SettingKey, string>

/** Saved values → what the boxes show (phones as people write them: 01…). */
function toForm(s: StoreSettings): Form {
  return Object.fromEntries(
    (Object.keys(LABEL) as SettingKey[]).map((k) => {
      const v = s[k]
      return [k, PHONE_KEYS.has(k) && typeof v === 'string' ? localPhone(v) : String(v)]
    }),
  ) as Form
}

export function SettingsPage() {
  const { state, retry } = useLoad(fetchSettings)
  return (
    <Panel title="Settings" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(settings) => <SettingsForm initial={settings} />}
    </Panel>
  )
}

export function SettingsForm({ initial }: { initial: StoreSettings }) {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState<Form>(() => toForm(initial))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details: string[] } | null>(null)
  const [done, setDone] = useState(false)

  const base = toForm(saved)
  const changed = (Object.keys(form) as SettingKey[]).filter((k) => form[k] !== base[k])
  const dirty = changed.length > 0

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (k: SettingKey) => (v: string) => {
    setDone(false)
    setForm((f) => ({ ...f, [k]: v }))
  }
  const text = (
    k: SettingKey,
    props: { hint?: string; placeholder?: string; maxLength?: number } = {},
  ) => (
    <Input label={LABEL[k]} value={form[k]} onChange={(e) => set(k)(e.target.value)} {...props} />
  )

  async function save() {
    const values = Object.fromEntries(
      changed.map((k) => [
        k,
        NUMBER_KEYS.has(k) ? (form[k].trim() === '' ? NaN : Number(form[k])) : form[k],
      ]),
    )
    const check = SETTINGS_SCHEMA.partial().strict().safeParse(values)
    if (!check.success)
      return setProblem({
        message: 'Some settings need fixing:',
        details: check.error.issues.map(
          (i) => `${LABEL[i.path[0] as SettingKey] ?? 'Setting'}: ${i.message}`,
        ),
      })
    setBusy(true)
    setProblem(null)
    const r = await saveSettings(check.data)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details ?? [] })
    setSaved(r.data)
    setForm(toForm(r.data))
    setDone(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Section title="Store" note="Shown in the header, footer, page titles and emails.">
        {text('store_name', { maxLength: 60 })}
        {text('store_tagline', {
          maxLength: 80,
          hint: 'Under the name, e.g. “always new”. Empty = none.',
        })}
      </Section>

      <Section
        title="Contact"
        note="Shown in the shop’s footer and on invoices. Empty fields are hidden."
      >
        {text('store_email', { hint: 'Customers’ replies to your emails go here too.' })}
        {text('store_phone', { placeholder: '01712345678' })}
        {text('store_whatsapp', {
          placeholder: '01712345678',
          hint: 'The shop links it to a WhatsApp chat.',
        })}
        {text('store_hours', { maxLength: 120, placeholder: 'Saturday–Thursday, 10 am – 8 pm' })}
        <div className="sm:col-span-2">
          <TextArea
            label={LABEL.store_address}
            value={form.store_address}
            maxLength={300}
            rows={2}
            onChange={(e) => set('store_address')(e.target.value)}
          />
        </div>
      </Section>

      <Section
        title="Social media"
        note="Icons in the footer. Only links to that site itself are accepted."
      >
        {(Object.keys(SOCIAL_SITES) as (keyof typeof SOCIAL_SITES)[]).map((k) => (
          <div key={k}>
            {text(k, { placeholder: `https://www.${SOCIAL_SITES[k].domains[0]}/yourpage` })}
          </div>
        ))}
      </Section>

      <Section
        title="Orders and stock"
        note="Changes apply to new checkouts — past orders keep their amounts."
      >
        {text('vat_rate', {
          hint: 'Added on (products − discount). 0 = no VAT. Up to 2 decimals.',
        })}
        {text('return_window_days', {
          hint: 'Days after delivery a customer may ask for a return. 0 = returns off.',
        })}
        {text('low_stock_threshold', {
          hint: 'Alert when a size/colour reaches this many (each can override it).',
        })}
        {text('payment_timeout_minutes', { hint: '5–1,440. Their stock goes back on sale.' })}
        <div className="sm:col-span-2">
          {text('admin_notification_email', {
            hint: 'Low-stock alerts go here. Empty = the address set up on the server.',
          })}
        </div>
      </Section>

      <Section
        title="Shop page"
        note="How /shop and category pages start (customers can still change the sort)."
      >
        <SelectField
          label={LABEL.shop_page_size}
          value={form.shop_page_size}
          onChange={(e) => set('shop_page_size')(e.target.value)}
        >
          {SHOP_PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={LABEL.shop_default_sort}
          value={form.shop_default_sort}
          onChange={(e) => set('shop_default_sort')(e.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </SelectField>
      </Section>

      <Section
        title="After ordering"
        note="Shown on the order confirmation page, under the order number."
      >
        <div className="sm:col-span-2">
          <TextArea
            label={LABEL.thank_you_message}
            value={form.thank_you_message}
            maxLength={300}
            rows={3}
            placeholder="Thank you for shopping with us! We’ll call you to confirm."
            onChange={(e) => set('thank_you_message')(e.target.value)}
            hint="Plain text. Empty = none."
          />
        </div>
      </Section>

      <Section
        title="Google"
        note="For the homepage and any page without its own. Empty = name and tagline."
      >
        {text('seo_title', { maxLength: 70 })}
        {text('seo_description', { maxLength: 160 })}
      </Section>

      {problem && (
        <div role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          <p className="font-medium">{problem.message}</p>
          <ul className="mt-1 list-disc pl-5">
            {problem.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-surface py-3">
        <Button disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
        {dirty && (
          <span className="text-sm text-warning">
            {changed.length} unsaved change{changed.length === 1 ? '' : 's'}
          </span>
        )}
        {done && (
          <span role="status" className="text-sm text-success">
            Saved. The shop shows it within a minute.
          </span>
        )}
      </div>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{note}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}
