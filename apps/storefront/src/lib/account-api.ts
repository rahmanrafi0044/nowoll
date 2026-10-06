import type {
  AccountOrderDetailView,
  AccountOrderSummaryView,
  AccountView,
  Paginated,
  SavedAddressView,
  WishlistEntryView,
} from '@nowoll/types'
import { call } from '@/lib/cart-api'

// The signed-in customer's own things (step 23). Every call carries the
// HttpOnly login cookies; the API only ever answers with THIS customer's data.

export const fetchMyOrders = (page = 1) =>
  call<Paginated<AccountOrderSummaryView>>('GET', `/orders/my?page=${page}`)
export const fetchMyOrder = (number: string) =>
  call<AccountOrderDetailView>('GET', `/orders/my/${encodeURIComponent(number)}`)

export type AddressInput = Omit<
  SavedAddressView,
  'id' | 'isDefault' | 'label' | 'addressLine2' | 'area' | 'postalCode'
> & {
  label?: string | null
  addressLine2?: string | null
  area?: string | null
  postalCode?: string | null
  isDefault?: boolean
}

export const fetchAddresses = () => call<SavedAddressView[]>('GET', '/addresses')
export const createAddress = (body: AddressInput) =>
  call<SavedAddressView>('POST', '/addresses', body)
export const updateAddress = (id: string, body: Partial<AddressInput>) =>
  call<SavedAddressView>('PATCH', `/addresses/${id}`, body)
export const deleteAddress = (id: string) => call<{ deleted: true }>('DELETE', `/addresses/${id}`)

export const fetchWishlist = () => call<WishlistEntryView[]>('GET', '/wishlist')
export const addToWishlist = (variantId: string) =>
  call<{ saved: true }>('POST', '/wishlist', { variantId })
export const removeFromWishlist = (variantId: string) =>
  call<{ removed: true }>('DELETE', `/wishlist/${variantId}`)

export const updateProfile = (body: { fullName?: string; phone?: string | null }) =>
  call<{ user: AccountView }>('PATCH', '/auth/me', body)
export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  call<{ changed: true }>('POST', '/auth/change-password', body)
