// The catalogue every browser test starts from (support/seed.ts creates it).
// Tests refer to these names instead of repeating strings.
//
// FIXED IDs on purpose: the storefront's product pages are built in advance
// with these ids inside (variant ids go into the bag). Random ids would make
// a reused build (E2E_SKIP_BUILD) point at variants that no longer exist.
export const CATEGORY = {
  id: 'e2e00000-0000-4000-8000-000000000001',
  name: 'Shirts',
  slug: 'e2e-shirts',
}

export const SHIRT = {
  id: 'e2e00000-0000-4000-8000-000000000002',
  name: 'Oxford Cotton Shirt',
  slug: 'e2e-oxford-cotton-shirt',
  price: '1490',
  color: 'Blue',
  sizes: { M: 'E2E-OXF-M', L: 'E2E-OXF-L', XL: 'E2E-OXF-XL' }, // size → SKU
  variantIds: {
    M: 'e2e00000-0000-4000-8000-000000000011',
    L: 'e2e00000-0000-4000-8000-000000000012',
    XL: 'e2e00000-0000-4000-8000-000000000013',
  },
  soldOutSize: 'XL', // stock 0 from the start
  stock: 500, // plenty: every run of every test buys some
}

export const DISCOUNT = { code: 'E2E10', percent: 10 }

export const CUSTOMER = {
  fullName: 'Rafi Rahman',
  email: 'rafi.e2e@example.com',
  phone: '01712345678',
  phoneNormalized: '+8801712345678',
  division: 'Dhaka',
  district: 'Dhaka',
  area: 'Dhanmondi',
  address: 'House 12, Road 5',
}

/** Inside Dhaka delivery (from the standard seed). */
export const DHAKA_DELIVERY = '60'

/** Made-up tracking IDs (step 39a): the shop shows the cookie banner and would load the tools. */
export const TRACKING = { ga4: 'G-E2ETEST01', pixel: '1234567890' }

/** A live blog post (step 43). */
export const BLOG_POST = { title: 'Style the oxford shirt', slug: 'style-the-oxford-shirt' }
/** An old address of the shirt (step 43c) — redirects to its product page. */
export const OLD_SHIRT_PATH = '/products/oxford-shirt-2025'

// ── Step 50: the admin panel ────────────────────────────────────────────────
// Accounts exist in BOTH places a real one does: a users row (seed.ts) and the
// pretend Supabase Auth of the e2e API (apps/api/test/e2e-server.ts, given
// these via E2E_FAKE_ACCOUNTS) — with the same id, as in production.
// Each admin starts WITHOUT an authenticator app: its first sign-in sets one
// up and shows the key (the 2FA code comes from it). One admin per spec file,
// so the files never depend on each other's order.
export const ADMIN = {
  id: 'e2e00000-0000-4000-8000-0000000000a1',
  email: 'owner.e2e@example.com',
  password: 'e2e-admin-password-1',
  fullName: 'Shop Owner',
}
export const CATALOG_ADMIN = {
  id: 'e2e00000-0000-4000-8000-0000000000a3',
  email: 'catalog.e2e@example.com',
  password: 'e2e-admin-password-2',
  fullName: 'Catalog Admin',
}
export const ORDERS_ADMIN = {
  id: 'e2e00000-0000-4000-8000-0000000000a4',
  email: 'orders.e2e@example.com',
  password: 'e2e-admin-password-3',
  fullName: 'Orders Admin',
}
/** Every staff account the seed creates (role ADMIN). */
export const STAFF_ACCOUNTS = [ADMIN, CATALOG_ADMIN, ORDERS_ADMIN]
/** A normal shop account: must never get into the admin panel. */
export const SHOPPER = {
  id: 'e2e00000-0000-4000-8000-0000000000a2',
  email: 'shopper.e2e@example.com',
  password: 'e2e-shopper-password-1',
  fullName: 'Shop Per',
}
/** The product a test creates in the admin panel (its slug is made unique per run). */
export const NEW_PRODUCT = { name: 'Linen Summer Panjabi', price: '2350', size: 'L', stock: 7 }
