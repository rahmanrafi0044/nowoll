-- CreateTable
CREATE TABLE "blog_post_products" (
    "post_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "blog_post_products_pkey" PRIMARY KEY ("post_id","product_id")
);

-- CreateIndex
CREATE INDEX "blog_post_products_product_id_idx" ON "blog_post_products"("product_id");

-- AddForeignKey
ALTER TABLE "blog_post_products" ADD CONSTRAINT "blog_post_products_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_post_products" ADD CONSTRAINT "blog_post_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security on every table (CLAUDE.md §7): no policy = no access through
-- Supabase's public API; only the server (which bypasses RLS) reads and writes it.
ALTER TABLE "blog_post_products" ENABLE ROW LEVEL SECURITY;
