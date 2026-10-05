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
