import { Prisma } from '@nowoll/database'
import { catalogRows, type FeedProduct, isCatalogImage, plainText } from './catalog-rows.js'

const D = (n: number | string) => new Prisma.Decimal(n)
const IMG = 'https://x.supabase.co/storage/v1/object/public/product-images/products/p1'

const shirt = (over: Partial<FeedProduct> = {}): FeedProduct => ({
  id: 'p1',
  name: 'Oxford Shirt',
  slug: 'oxford-shirt',
  shortDescription: 'A crisp everyday shirt.',
  description: null,
  categoryId: 'c-shirts',
  basePrice: D(1490),
  compareAtPrice: null,
  variants: [
    {
      id: 'v-m-blue',
      sku: 'NW-OXF-M-BLU',
      size: 'M',
      color: 'Blue',
      colorHex: null,
      price: null,
      compareAtPrice: null,
      stock: 3,
      sortOrder: 0,
    },
    {
      id: 'v-l-white',
      sku: 'NW-OXF-L-WHT',
      size: 'L',
      color: 'White',
      colorHex: null,
      price: null,
      compareAtPrice: null,
      stock: 0,
      sortOrder: 1,
    },
  ],
  images: [
    { url: `${IMG}/main.jpg`, variantId: null, sortOrder: 0 },
    { url: `${IMG}/white.png`, variantId: 'v-l-white', sortOrder: 1 },
    { url: `${IMG}/old.webp`, variantId: null, sortOrder: 2 },
  ],
  ...over,
})
const ctx = {
  siteUrl: 'https://nowoll.com/',
  brand: 'Nowoll',
  categoryPath: (id: string) => (id === 'c-shirts' ? 'Men > Shirts' : ''),
}

describe('Meta catalogue rows (step 39c)', () => {
  it('one row per size/colour, in Meta’s fields and formats', () => {
    const { rows, skipped } = catalogRows([shirt()], ctx)
    expect(skipped).toEqual([])
    expect(rows).toEqual([
      {
        id: 'NW-OXF-M-BLU', // = the Pixel's content id (SKU)
        item_group_id: 'p1', // = the Pixel's ViewContent id
        title: 'Oxford Shirt',
        description: 'A crisp everyday shirt.',
        availability: 'in stock',
        condition: 'new',
        price: '1490.00 BDT',
        sale_price: '',
        link: 'https://nowoll.com/products/oxford-shirt',
        image_link: `${IMG}/main.jpg`,
        additional_image_link: `${IMG}/white.png`, // WebP left out
        brand: 'Nowoll',
        size: 'M',
        color: 'Blue',
        product_type: 'Men > Shirts',
        status: 'active',
      },
      expect.objectContaining({
        id: 'NW-OXF-L-WHT',
        availability: 'out of stock',
        image_link: `${IMG}/white.png`, // that colour's own photo first
        additional_image_link: `${IMG}/main.jpg`,
      }),
    ])
  })

  it('on sale: the higher "was" price is the price, today’s is the sale price — same rule as the shop', () => {
    const { rows } = catalogRows(
      [
        shirt({
          compareAtPrice: D(1990),
          variants: [
            { ...shirt().variants[0]! }, // product price 1490, was 1990
            // own price 1290 without its own "was" → not on sale (the shop shows no strike-through)
            { ...shirt().variants[1]!, price: D(1290) },
          ],
        }),
      ],
      ctx,
    )
    expect(rows[0]).toMatchObject({ price: '1990.00 BDT', sale_price: '1490.00 BDT' })
    expect(rows[1]).toMatchObject({ price: '1290.00 BDT', sale_price: '' })
  })

  it('a "was" price that is not higher is ignored (Meta: sale price must be lower)', () => {
    const { rows } = catalogRows([shirt({ compareAtPrice: D(1490) })], ctx)
    expect(rows[0]).toMatchObject({ price: '1490.00 BDT', sale_price: '' })
  })

  it('description: plain text from Markdown; falls back, never empty or equal to the title', () => {
    const md = shirt({
      shortDescription: null,
      description: '## Fabric\n\n- **100%** cotton\n- See [care guide](https://x.com)\n\n<b>Hi</b>',
    })
    expect(catalogRows([md], ctx).rows[0]!.description).toBe('Fabric 100% cotton See care guide Hi')
    const bare = shirt({ shortDescription: null, description: null })
    expect(catalogRows([bare], ctx).rows[0]!.description).toBe(
      'Oxford Shirt from Nowoll, in Blue, White.',
    )
    const same = shirt({ shortDescription: 'oxford shirt' })
    expect(catalogRows([same], ctx).rows[0]!.description).toMatch(/^Oxford Shirt from Nowoll/)
  })

  it('left out and reported: no photo, only WebP photos, no sizes; a ৳0 size alone is dropped', () => {
    const { rows, skipped } = catalogRows(
      [
        shirt({ id: 'a', name: 'No photo', images: [] }),
        shirt({
          id: 'b',
          name: 'Webp only',
          images: [{ url: `${IMG}/x.webp`, variantId: null, sortOrder: 0 }],
        }),
        shirt({ id: 'c', name: 'No sizes', variants: [] }),
        shirt({
          id: 'd',
          name: 'Free',
          variants: [{ ...shirt().variants[0]!, price: D(0) }, shirt().variants[1]!],
        }),
      ],
      ctx,
    )
    expect(skipped.map((s) => [s.name, s.reason])).toEqual([
      ['No photo', 'No photo'],
      ['Webp only', expect.stringMatching(/WebP.*JPEG or PNG/)],
      ['No sizes', expect.stringMatching(/No sizes/)],
      ['Free', expect.stringMatching(/৳0/)],
    ])
    expect(rows.map((r) => r.id)).toEqual(['NW-OXF-L-WHT']) // only "Free"'s priced size
  })

  it('at most 20 extra photos (Meta’s limit)', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      url: `${IMG}/${i}.jpg`,
      variantId: null,
      sortOrder: i,
    }))
    const row = catalogRows([shirt({ images: many })], ctx).rows[0]!
    expect(row.additional_image_link.split(',')).toHaveLength(20)
  })
})

describe('helpers', () => {
  it('plainText: no formula start, length limit with an ellipsis', () => {
    expect(plainText('=HYPERLINK("x")', 100)).toBe('HYPERLINK("x")')
    expect(plainText('- 100% cotton', 100)).toBe('100% cotton')
    expect(plainText('@home', 100)).toBe('home')
    expect(plainText('a'.repeat(20), 10)).toBe(`${'a'.repeat(9)}…`)
  })

  it('isCatalogImage: JPEG/PNG by the file name, whatever the query string', () => {
    expect(isCatalogImage(`${IMG}/a.JPG`)).toBe(true)
    expect(isCatalogImage(`${IMG}/a.png?v=2`)).toBe(true)
    expect(isCatalogImage(`${IMG}/a.webp`)).toBe(false)
    expect(isCatalogImage('not a url.jpg')).toBe(false)
  })
})
