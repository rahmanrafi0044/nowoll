-- =============================================================================
-- 1. Double-submit protection for "Place order" (see Order.idempotencyKey)
-- =============================================================================
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotency_key" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");


-- =============================================================================
-- 2. Order numbers start at 10001 (shown as NW-10001), so early customers
--    can't tell from their order number how new the shop is.
--    START WITH also makes "TRUNCATE … RESTART IDENTITY" (used by tests)
--    restart at 10001. Only moves the counter forward — never backwards.
-- =============================================================================
DO $$
BEGIN
  IF (SELECT COALESCE(MAX(order_number), 0) FROM orders) < 10001 THEN
    ALTER SEQUENCE orders_order_number_seq START WITH 10001 RESTART WITH 10001;
  END IF;
END $$;
