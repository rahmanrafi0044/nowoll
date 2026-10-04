-- =============================================================================
-- Row Level Security (RLS) + CHECK constraints
-- =============================================================================
--
-- WHY RLS WITH NO POLICIES?
-- Supabase automatically exposes every table in the `public` schema through
-- its REST API, reachable with the public "anon" key that ships to browsers.
-- Turning RLS on with zero policies means that API can read/write NOTHING.
--
-- Our NestJS API is the only thing that touches these tables. It connects via
-- Prisma as the table OWNER, and owners bypass RLS — so the API keeps full
-- access while the public Supabase endpoint is locked shut.
--
-- If a new table is added later, its migration MUST enable RLS too
-- (CLAUDE.md §7: "no table is ever left without a policy").
-- =============================================================================

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shipping_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discount_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discount_usages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wishlist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "return_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "return_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blog_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscribers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;

-- Prisma's own bookkeeping table is also in `public`, so lock it too.
-- Guarded with IF because Prisma's temporary "shadow" database (used to
-- check migrations) doesn't have this table.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- =============================================================================
-- CHECK constraints — the database's last line of defence.
-- The API validates all of this too, but if a bug ever slips through, Postgres
-- rejects the write instead of storing impossible data.
-- (Prisma can't declare CHECK constraints in schema.prisma, so they live here.)
-- =============================================================================

-- Stock can never go negative → overselling is impossible even if two
-- customers buy the last shirt at the same moment.
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_non_negative" CHECK ("stock" >= 0);

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_quantity_positive" CHECK ("quantity" > 0);

-- Money columns can't be negative
ALTER TABLE "products" ADD CONSTRAINT "products_base_price_non_negative" CHECK ("base_price" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_non_negative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_non_negative" CHECK (
  "subtotal" >= 0 AND "discount_amount" >= 0 AND "shipping_fee" >= 0 AND "vat_amount" >= 0 AND "total" >= 0
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_fee_non_negative" CHECK ("fee" >= 0);

-- Discounts: a percentage can't exceed 100%, and values must be positive
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_value_valid" CHECK (
  "value" > 0 AND ("type" <> 'PERCENTAGE' OR "value" <= 100)
);
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_used_count_non_negative" CHECK ("used_count" >= 0);

-- Only one shipping zone may be the catch-all default.
-- (A "partial unique index": uniqueness applies only to rows where is_default = true.)
CREATE UNIQUE INDEX "shipping_zones_single_default" ON "shipping_zones" ("is_default") WHERE "is_default" = true;
