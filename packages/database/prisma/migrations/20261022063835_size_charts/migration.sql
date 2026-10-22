-- CreateEnum
CREATE TYPE "SizeUnit" AS ENUM ('INCH', 'CM');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "size_chart_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "size_chart_id" UUID;

-- CreateTable
CREATE TABLE "size_charts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "SizeUnit" NOT NULL DEFAULT 'INCH',
    "note" TEXT,
    "pieces" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "size_charts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_size_chart_id_fkey" FOREIGN KEY ("size_chart_id") REFERENCES "size_charts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_size_chart_id_fkey" FOREIGN KEY ("size_chart_id") REFERENCES "size_charts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row Level Security on every table (CLAUDE.md §7): no policy = no access through
-- Supabase's public API; only the server (which bypasses RLS) reads and writes it.
ALTER TABLE "size_charts" ENABLE ROW LEVEL SECURITY;
