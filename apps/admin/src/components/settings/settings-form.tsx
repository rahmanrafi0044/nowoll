'use client'

import { Button, Input } from '@nowoll/ui'
import {
  BRAND_PRESETS,
  contrastWithWhite,
  FONTS,
  localPhone,
  MIN_CONTRAST,
  SETTINGS_SCHEMA,
  type SettingKey,
  SHOP_PAGE_SIZES,
  SOCIAL_SITES,
  type StoreSettings,
} from '@nowoll/validation'
import Link from 'next/link'
import { type ReactNode, useEffect, useState } from 'react'
import { ImageField } from '@/components/content/fields'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { SelectField, TextArea } from '@/components/form-fields'
import { PREVIEW_FONT } from '@/lib/fonts'
import {
  fetchPaymentStatus,
  fetchSettings,
  saveSettings,
  uploadBrandImage,
} from '@/lib/settings-api'

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
  logo_url: 'Logo',
  favicon_url: 'Favicon',
  share_image_url: 'Share image',
  brand_color: 'Brand colour',
  font: 'Font',
  payment_cod_enabled: 'Cash on delivery',
  payment_online_enabled: 'Online payment (SSLCommerz)',
  payment_cod_description: 'Cash on delivery: description',
  payment_online_description: 'Online payment: description',
  cod_max_total: 'Cash-on-delivery limit (৳)',
  min_order_amount: 'Minimum order (৳)',
  ga4_measurement_id: 'Google Analytics 4 Measurement ID',
  gtm_container_id: 'Google Tag Manager container ID',
  meta_pixel_id: 'Meta Pixel ID',
  meta_domain_verification: 'Meta domain verification code',
  meta_capi_enabled: 'Send events from the server (Meta Conversions API)',
  meta_catalog_enabled: 'Catalog feed for Meta', // switched in Admin → Marketing (step 39c)
}

const NUMBER_KEYS = new Set<SettingKey>([
  'vat_rate',
  'return_window_days',
  'low_stock_threshold',
  'payment_timeout_minutes',
  'shop_page_size',
  'cod_max_total',
  'min_order_amount',
])
/** Number boxes where empty means "none" (stored as 0) — step 38c. */
const ZERO_IF_EMPTY = new Set<SettingKey>(['cod_max_total', 'min_order_amount'])
const BOOLEAN_KEYS = new Set<SettingKey>([
  'payment_cod_enabled',
  'payment_online_enabled',
  'meta_capi_enabled',
  'meta_catalog_enabled',
])
const PHONE_KEYS = new Set<SettingKey>(['store_phone', 'store_whatsapp'])

type Form = Record<SettingKey, string>

/** Saved values → what the boxes show (phones as people write them: 01…). */
function toForm(s: StoreSettings): Form {
  return Object.fromEntries(
    (Object.keys(LABEL) as SettingKey[]).map((k) => {
      const v = s[k]
      if (ZERO_IF_EMPTY.has(k) && v === 0) return [k, '']
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
        BOOLEAN_KEYS.has(k)
          ? form[k] === 'true'
          : NUMBER_KEYS.has(k)
            ? form[k].trim() === ''
              ? ZERO_IF_EMPTY.has(k)
                ? 0
                : NaN
              : Number(form[k])
            : form[k],
      ]),
    )
    if (form.payment_cod_enabled !== 'true' && form.payment_online_enabled !== 'true')
      return setProblem({
        message: 'Some settings need fixing:',
        details: ['Payments: keep at least one way to pay switched on'],
      })
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
        title="Look"
        note="How the shop looks. The admin panel keeps its own black-and-white look. Upload, then Save settings."
      >
        <div className="grid gap-4 sm:col-span-2 lg:grid-cols-3">
          <ImageField
            label={LABEL.logo_url}
            url={form.logo_url || null}
            onChange={(u) => set('logo_url')(u ?? '')}
            upload={(f) => uploadBrandImage('logo', f)}
            hint="In the header, up to 40 px tall. A PNG with a see-through background looks best."
          />
          <ImageField
            label={LABEL.favicon_url}
            url={form.favicon_url || null}
            onChange={(u) => set('favicon_url')(u ?? '')}
            upload={(f) => uploadBrandImage('favicon', f)}
            hint="The browser-tab icon. Cropped to a square; at least 64×64."
          />
          <ImageField
            label={LABEL.share_image_url}
            url={form.share_image_url || null}
            onChange={(u) => set('share_image_url')(u ?? '')}
            upload={(f) => uploadBrandImage('share', f)}
            hint="Facebook / WhatsApp link preview. Cropped to 1200×630; at least 600×315."
          />
        </div>
        <div className="sm:col-span-2">
          <BrandColour value={form.brand_color} onChange={set('brand_color')} />
        </div>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <SelectField
            label={LABEL.font}
            value={form.font}
            onChange={(e) => set('font')(e.target.value)}
          >
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </SelectField>
          <p
            aria-label="Font preview"
            className="rounded-control border border-border p-3 text-lg"
            style={{ fontFamily: PREVIEW_FONT[form.font] ?? PREVIEW_FONT.system }}
          >
            New Eid panjabi — ঈদের নতুন পাঞ্জাবি · ৳2,490
          </p>
        </div>
      </Section>

      <Section
        title="Payments"
        note="Which ways to pay checkout offers. Changes apply to new checkouts — past orders are untouched."
      >
        <PaymentSwitches form={form} set={set} />
        {text('payment_cod_description', {
          maxLength: 120,
          placeholder: 'Pay the courier when your parcel arrives',
          hint: 'Shown at checkout. Empty = the standard wording.',
        })}
        {text('payment_online_description', {
          maxLength: 120,
          placeholder: 'Card, bKash, Nagad or Rocket — on SSLCommerz’s secure page',
          hint: 'Shown at checkout. Empty = the standard wording.',
        })}
        {text('cod_max_total', {
          placeholder: 'No limit',
          hint: 'Bigger orders (the amount the courier collects) must pay online. Empty = no limit.',
        })}
        {text('min_order_amount', {
          placeholder: 'None',
          hint: 'Products after any discount, not delivery. Empty = no minimum.',
        })}
      </Section>

      <Section
        title="Google"
        note="For the homepage and any page without its own. Empty = name and tagline."
      >
        {text('seo_title', { maxLength: 70 })}
        {text('seo_description', { maxLength: 160 })}
      </Section>

      <Section
        title="Marketing and tracking"
        note="Only the IDs — the shop adds each tool’s official code itself, and loads it only for customers who agree in the cookie banner. Empty = not used. Step-by-step guide: docs/integrations/analytics.md and meta.md."
      >
        {text('ga4_measurement_id', {
          placeholder: 'G-AB12CD34EF',
          hint: 'Google Analytics → Admin → Data streams → Web → Measurement ID.',
        })}
        {text('gtm_container_id', {
          placeholder: 'GTM-AB12CD3',
          hint: 'Tag Manager → the ID at the top of the workspace. Needs both Analytics and Marketing consent.',
        })}
        {form.ga4_measurement_id.trim() && form.gtm_container_id.trim() && (
          <p
            role="note"
            className="rounded-control bg-warning-soft p-3 text-sm text-warning sm:col-span-2"
          >
            Using both? Don’t also add a Google Analytics tag inside Tag Manager — every visit would
            be counted twice. Use one way or the other.
          </p>
        )}
        {text('meta_pixel_id', {
          placeholder: '123456789012345',
          hint: 'Meta Events Manager → Data sources → your Pixel (dataset) → its ID (digits only).',
        })}
        {text('meta_domain_verification', {
          placeholder: 'a1b2c3d4e5f6g7h8i9j0',
          hint: 'Business Settings → Brand safety → Domains → Meta-tag verification. Paste the code (or the whole tag — only the code is kept).',
        })}
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={form.meta_capi_enabled === 'true'}
            onChange={(e) => set('meta_capi_enabled')(String(e.target.checked))}
          />
          <span>
            <span className="font-medium">{LABEL.meta_capi_enabled}</span>
            <span className="block text-muted-foreground">
              Sales and delivered orders also go to Meta from the server — only for customers who
              allowed Marketing cookies. Needs the access token on the server; check it in{' '}
              <Link href="/admin/marketing" className="underline underline-offset-4">
                Marketing
              </Link>
              .
            </span>
          </span>
        </label>
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

/** Ready-made colours or your own — with the contrast check and a live preview. */
function BrandColour({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = value.trim().toLowerCase()
  const valid = /^#[0-9a-f]{6}$/.test(hex)
  const ratio = valid ? contrastWithWhite(hex) : null
  const readable = ratio !== null && ratio >= MIN_CONTRAST
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{LABEL.brand_color}</legend>
      <div role="group" aria-label="Ready-made colours" className="flex flex-wrap gap-2">
        {BRAND_PRESETS.map((p) => (
          <button
            key={p.color}
            type="button"
            aria-pressed={hex === p.color}
            onClick={() => onChange(p.color)}
            className={`flex items-center gap-2 rounded-control border px-2.5 py-1.5 text-sm ${hex === p.color ? 'border-foreground font-semibold' : 'border-border'}`}
          >
            <span
              aria-hidden="true"
              className="size-4 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Pick your own
          <input
            type="color"
            value={valid ? hex : '#111111'}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-16 cursor-pointer rounded-control border border-border-strong bg-surface"
          />
        </label>
        <div className="w-40">
          <Input
            label="Colour code"
            value={value}
            maxLength={7}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
      <p className={`text-sm ${readable ? 'text-success' : 'text-danger'}`}>
        {!valid
          ? 'A colour code looks like #1e3a8a.'
          : readable
            ? `Readable: white text on it has ${ratio!.toFixed(1)}:1 contrast (4.5 or more needed). ✓`
            : `Too light: white text on it has only ${ratio!.toFixed(1)}:1 contrast (4.5 or more needed). Choose a darker colour.`}
      </p>
      {readable && (
        <div
          aria-label="Colour preview"
          className="flex flex-wrap items-center gap-4 rounded-control border border-border p-4"
        >
          <span
            className="rounded-control px-5 py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: hex }}
          >
            Add to bag
          </span>
          <span className="rounded-control border-2 px-4 py-2 text-sm" style={{ borderColor: hex }}>
            Selected size: M
          </span>
          <span
            className="rounded-control px-3 py-2 text-sm"
            style={{ outline: `2px solid ${hex}`, outlineOffset: '2px' }}
          >
            Keyboard focus
          </span>
        </div>
      )}
    </fieldset>
  )
}

/** The two on/off switches — and a warning when online payment isn't set up on the server. */
function PaymentSwitches({
  form,
  set,
}: {
  form: Form
  set: (k: SettingKey) => (v: string) => void
}) {
  const status = useLoad(fetchPaymentStatus)
  const notSetUp =
    form.payment_online_enabled === 'true' &&
    status.state.status === 'ok' &&
    !status.state.data.onlineConfigured
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      {(['payment_cod_enabled', 'payment_online_enabled'] as const).map((k) => (
        <label key={k} className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={form[k] === 'true'}
            onChange={(e) => set(k)(String(e.target.checked))}
          />
          {LABEL[k]} — offered at checkout
        </label>
      ))}
      {notSetUp && (
        <p role="note" className="rounded-control bg-warning-soft p-3 text-sm text-warning">
          Online payment isn’t set up on the server yet, so customers won’t see it. Adding the
          SSLCommerz keys is a developer task (they’re secret — never entered here).
        </p>
      )}
    </div>
  )
}
