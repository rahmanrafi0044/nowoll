# Courier Integration Contract

## Overview
Nowoll uses Bangladesh domestic courier services for order delivery.

**Phase 1 (launch):** Manual courier booking — admin enters tracking number manually in the admin panel after booking via the courier's own app/website.

**Phase 2 (post-launch):** API integration with Pathao Commerce or Steadfast Courier.

---

## Phase 1 — Manual Flow

1. Order status updated to `PROCESSING` by admin
2. Admin books delivery via courier's app (Pathao, Steadfast, Paperfly, etc.)
3. Admin copies tracking number
4. Admin opens order in Nowoll admin panel → enters courier name + tracking number → saves
5. Order status updates to `SHIPPED`
6. System sends "Shipped" email to customer with courier name and tracking number

**Fields required:** `courier_name` (text) + `tracking_number` (text) on the `orders` table

No API integration required for Phase 1.

---

## Phase 2 — Pathao Commerce API (TODO after launch)

**Status:** NOT IMPLEMENTED YET — do not write any Pathao API code until Rafi provides:
- Official Pathao Commerce API documentation URL
- Merchant account credentials
- Webhook secret

**Placeholder adapter:**
```typescript
// packages/shipping/src/pathao.adapter.ts
// TODO: Implement after receiving Pathao Commerce API documentation and credentials
// Contact: Pathao merchant support

export class PathaoAdapter implements CourierProvider {
  async createDelivery(params: DeliveryParams): Promise<DeliveryResult> {
    throw new Error('Pathao integration not yet implemented. Use manual tracking.');
  }
}
```

---

## Courier Provider Interface

```typescript
// packages/shipping/src/types.ts
export interface CourierProvider {
  createDelivery(params: DeliveryParams): Promise<DeliveryResult>
  trackDelivery(trackingId: string): Promise<TrackingResult>
  cancelDelivery(trackingId: string): Promise<void>
}

export interface DeliveryParams {
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  district: string;
  division: string;
  itemWeight?: number;    // grams
  itemDescription: string;
  cashOnDelivery?: number; // BDT amount if COD
}

export interface DeliveryResult {
  success: boolean;
  trackingId?: string;
  estimatedDelivery?: string;
  error?: string;
}
```

---

## Shipping Zones

```
DHAKA       — Dhaka city and metropolitan area
OUTSIDE_DHAKA — All other districts in Bangladesh
INTERNATIONAL — Outside Bangladesh (future, not in scope for v1)
```

Rates are configurable per zone from the admin panel. Do not hardcode.

---

*Claude Code: do NOT implement any courier API in Phase 1. The manual flow is sufficient for launch. Only implement API integration when explicitly instructed and when official documentation is provided.*
