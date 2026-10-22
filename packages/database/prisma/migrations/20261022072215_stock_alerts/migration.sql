-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_alerts_variant_id_notified_at_idx" ON "stock_alerts"("variant_id", "notified_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_alerts_variant_id_email_key" ON "stock_alerts"("variant_id", "email");

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security on every table (CLAUDE.md §7): no policy = no access through
-- Supabase's public API; only the server (which bypasses RLS) reads and writes it.
-- (Shoppers' email addresses: never readable from the browser.)
ALTER TABLE "stock_alerts" ENABLE ROW LEVEL SECURITY;
