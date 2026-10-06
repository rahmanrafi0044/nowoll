import type { MyReviewView, ProductReviewsView } from '@nowoll/types'
import { call } from '@/lib/cart-api'

// Reviews (step 24). Public lists need no sign-in; writing does (cookies sent by call()).
export const fetchProductReviews = (productId: string, page: number) =>
  call<ProductReviewsView>('GET', `/reviews/product/${productId}?page=${page}`)

export const fetchMyReviews = () => call<MyReviewView[]>('GET', '/reviews/my')

export const submitReview = (body: {
  productId: string
  rating: number
  title: string | null
  body: string
}) => call<MyReviewView>('POST', '/reviews', body)
