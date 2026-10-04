// Bangladesh's 8 divisions and 64 districts (official English spellings since
// the 2018 renaming: Chattogram, Cumilla, Barishal, Jashore, Bogura).
//
// This is geography, not a business rule — it doesn't change when Nowoll's
// policies change — so it's fine in code. (Shipping FEES per district are a
// business rule and live in the shipping_zones table.)
//
// NOTE for Phase 2 courier integration: some couriers still use old spellings
// (e.g. "Chittagong", "Comilla"). Map names at the courier adapter, not here.
export const DIVISION_DISTRICTS = {
  Barishal: ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur'],
  Chattogram: [
    'Bandarban',
    'Brahmanbaria',
    'Chandpur',
    'Chattogram',
    "Cox's Bazar",
    'Cumilla',
    'Feni',
    'Khagrachhari',
    'Lakshmipur',
    'Noakhali',
    'Rangamati',
  ],
  Dhaka: [
    'Dhaka',
    'Faridpur',
    'Gazipur',
    'Gopalganj',
    'Kishoreganj',
    'Madaripur',
    'Manikganj',
    'Munshiganj',
    'Narayanganj',
    'Narsingdi',
    'Rajbari',
    'Shariatpur',
    'Tangail',
  ],
  Khulna: [
    'Bagerhat',
    'Chuadanga',
    'Jashore',
    'Jhenaidah',
    'Khulna',
    'Kushtia',
    'Magura',
    'Meherpur',
    'Narail',
    'Satkhira',
  ],
  Mymensingh: ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'],
  Rajshahi: [
    'Bogura',
    'Chapainawabganj',
    'Joypurhat',
    'Naogaon',
    'Natore',
    'Pabna',
    'Rajshahi',
    'Sirajganj',
  ],
  Rangpur: [
    'Dinajpur',
    'Gaibandha',
    'Kurigram',
    'Lalmonirhat',
    'Nilphamari',
    'Panchagarh',
    'Rangpur',
    'Thakurgaon',
  ],
  Sylhet: ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
} as const satisfies Record<string, readonly string[]>

export type Division = keyof typeof DIVISION_DISTRICTS
export type District = (typeof DIVISION_DISTRICTS)[Division][number]

export const DIVISIONS = Object.keys(DIVISION_DISTRICTS) as Division[]
export const DISTRICTS = Object.values(DIVISION_DISTRICTS).flat() as District[]

export function isDistrictInDivision(district: string, division: string): boolean {
  const list = (DIVISION_DISTRICTS as Record<string, readonly string[]>)[division]
  return list?.includes(district) ?? false
}
