import type { MyReviewView, ProductDetailView, ProductReviewsView } from '@nowoll/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { productJsonLd } from '@/lib/product-json-ld'
import { OrderReviews } from './order-reviews'
import { ProductReviews } from './product-reviews'
import { ReviewForm } from './review-form'

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let routes: Record<string, () => [number, object]> = {}
const ok = (data: unknown): [number, object] => [200, { success: true, data }]

beforeEach(() => {
  calls = []
  routes = {}
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      const method = init.method ?? 'GET'
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
      const path = url.replace(/^.*\/api\/v1/, '')
      const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k))
      const [status, body] = key ? routes[key]!() : [404, { success: false, message: 'Not found' }]
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const review = (n: number, over: object = {}) => ({
  id: `r${n}`,
  rating: 5,
  title: `Title ${n}`,
  body: `Body ${n} — lovely shirt`,
  author: 'Rafi R.',
  createdAt: '2026-10-05T04:00:00.000Z',
  ...over,
})
const page = (over: Partial<ProductReviewsView> = {}): ProductReviewsView => ({
  summary: { average: 4.3, count: 6, breakdown: { '1': 0, '2': 0, '3': 1, '4': 2, '5': 3 } },
  items: [1, 2, 3, 4, 5].map((n) => review(n)),
  total: 6,
  page: 1,
  pageSize: 5,
  totalPages: 2,
  ...over,
})

describe('product page reviews', () => {
  it('average, breakdown and reviews (first name + last initial, verified)', () => {
    render(<ProductReviews productId="p1" initial={page()} />)
    expect(screen.getByRole('heading', { name: 'Reviews (6)' })).toBeVisible()
    expect(screen.getByText('4.3')).toBeVisible()
    expect(screen.getByRole('img', { name: '4.3 out of 5 stars' })).toBeVisible()
    const breakdown = within(screen.getByRole('list', { name: 'Ratings breakdown' })).getAllByRole(
      'listitem',
    )
    expect(breakdown.map((b) => b.textContent)).toEqual([
      '5★3 reviews',
      '4★2 reviews',
      '3★1 review',
      '2★0 reviews',
      '1★0 reviews',
    ])
    expect(screen.getAllByText(/Rafi R\. · Verified buyer · 5 Oct 2026/)).toHaveLength(5)
  })

  it('"Show more" loads the next page and adds it; then the button goes', async () => {
    routes['GET /reviews/product/p1?page=2'] = () =>
      ok(page({ items: [review(6, { author: 'Nusrat' })], page: 2 }))
    render(<ProductReviews productId="p1" initial={page()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }))
    expect(await screen.findByText(/Nusrat · Verified buyer/)).toBeVisible()
    expect(screen.getByText('Title 1')).toBeVisible() // kept
    expect(screen.queryByRole('button', { name: 'Show more reviews' })).toBeNull()
  })

  it('no reviews yet → a friendly line; reviews unavailable → nothing at all', () => {
    const empty = page({
      summary: { average: null, count: 0, breakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } },
      items: [],
      total: 0,
      totalPages: 0,
    })
    const { unmount } = render(<ProductReviews productId="p1" initial={empty} />)
    expect(screen.getByText(/No reviews yet/)).toBeVisible()
    unmount()
    const { container } = render(<ProductReviews productId="p1" initial={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('structured data for Google', () => {
  const product = {
    name: 'Oxford Shirt',
    slug: 'oxford-shirt',
    shortDescription: null,
    description: null,
    basePrice: '1490',
    images: [],
    variants: [{ price: '1490', inStock: true }],
  } as unknown as ProductDetailView

  it('star rating only when there are approved reviews', () => {
    expect(productJsonLd(product, null, 'Nowoll')).not.toHaveProperty('aggregateRating')
    expect(
      productJsonLd(
        product,
        page({
          summary: {
            average: null,
            count: 0,
            breakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
          },
          items: [],
        }),
        'Nowoll',
      ),
    ).not.toHaveProperty('aggregateRating')
    const ld = productJsonLd(product, page(), 'Nowoll') as Record<string, unknown>
    expect(ld.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.3,
      reviewCount: 6,
      bestRating: 5,
      worstRating: 1,
    })
    expect((ld.review as object[])[0]).toEqual({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 },
      author: { '@type': 'Person', name: 'Rafi R.' },
      datePublished: '2026-10-05',
      name: 'Title 1',
      reviewBody: 'Body 1 — lovely shirt',
    })
  })
})

describe('writing a review', () => {
  it('needs stars and at least 10 characters before sending', () => {
    render(
      <ReviewForm
        productId="p1"
        productName="Oxford Shirt"
        existing={null}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Your review'), { target: { value: 'Too short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send review' }))
    expect(screen.getByText('Choose 1 to 5 stars')).toBeVisible()
    expect(screen.getByText('Please write at least 10 characters')).toBeVisible()
    expect(calls).toEqual([])
  })

  it('sends the review and hands back the saved one', async () => {
    const saved: MyReviewView = {
      id: 'r1',
      productId: 'p1',
      rating: 4,
      title: null,
      body: 'Fits well, soft cotton.',
      status: 'PENDING',
      rejectionReason: null,
      updatedAt: '2026-10-06T04:00:00.000Z',
    }
    routes['POST /reviews'] = () => [201, { success: true, data: saved }]
    const onSaved = vi.fn()
    render(
      <ReviewForm
        productId="p1"
        productName="Oxford Shirt"
        existing={null}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    fireEvent.change(screen.getByLabelText('Your review'), {
      target: { value: '  Fits well, soft cotton.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send review' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(calls[0]!.body).toEqual({
      productId: 'p1',
      rating: 4,
      title: null,
      body: 'Fits well, soft cotton.',
    })
  })
})

describe('reviews on a delivered order', () => {
  const items = [
    {
      productId: 'p1',
      productName: 'Oxford Shirt',
      variantLabel: 'M / Blue',
      imageUrl: null,
      unitPrice: '1490',
      quantity: 1,
      lineTotal: '1490',
      sku: 'NW-TEST-SKU',
    },
    {
      productId: 'p1',
      productName: 'Oxford Shirt',
      variantLabel: 'L / Blue',
      imageUrl: null,
      unitPrice: '1490',
      quantity: 1,
      lineTotal: '1490',
      sku: 'NW-TEST-SKU',
    },
    {
      productId: 'p2',
      productName: 'Linen Panjabi',
      variantLabel: '40 / White',
      imageUrl: null,
      unitPrice: '2490',
      quantity: 1,
      lineTotal: '2490',
      sku: 'NW-TEST-SKU',
    },
    {
      productId: null,
      productName: 'Old Product',
      variantLabel: 'M',
      imageUrl: null,
      unitPrice: '990',
      quantity: 1,
      lineTotal: '990',
      sku: 'NW-TEST-SKU',
    },
  ]
  const mine = (over: Partial<MyReviewView>): MyReviewView => ({
    id: 'r',
    productId: 'p2',
    rating: 2,
    title: null,
    body: 'Colour faded quickly.',
    status: 'PENDING',
    rejectionReason: null,
    updatedAt: '2026-10-06T04:00:00.000Z',
    ...over,
  })

  it('one row per product (sizes share one review); deleted products are left out', async () => {
    routes['GET /reviews/my'] = () => ok([])
    render(<OrderReviews items={items} />)
    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Oxford ShirtWrite a review',
      'Linen PanjabiWrite a review',
    ])
  })

  it("shows each review's status; a rejected one shows why and can be edited", async () => {
    routes['GET /reviews/my'] = () =>
      ok([
        mine({ productId: 'p1', status: 'APPROVED', rating: 5 }),
        mine({ status: 'REJECTED', rejectionReason: 'Please leave out the phone number.' }),
      ])
    render(<OrderReviews items={items} />)
    expect(await screen.findByText('Published')).toBeVisible()
    expect(screen.getByText('Not published')).toBeVisible()
    expect(screen.getByText(/Why: Please leave out the phone number\./)).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Edit your review' })).toHaveLength(2)
  })

  it('after saving, the row shows "Waiting for approval"', async () => {
    routes['GET /reviews/my'] = () => ok([])
    routes['POST /reviews'] = () => [
      201,
      { success: true, data: mine({ productId: 'p1', rating: 5 }) },
    ]
    render(<OrderReviews items={items} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Write a review' }))[0]!)
    fireEvent.click(screen.getByRole('radio', { name: '5 stars' }))
    fireEvent.change(screen.getByLabelText('Your review'), {
      target: { value: 'Great fit and fabric.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send review' }))
    expect(await screen.findByText('Waiting for approval')).toBeVisible()
  })
})
