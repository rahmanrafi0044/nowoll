-- CreateEnum
CREATE TYPE "RedirectSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "redirects" (
    "id" UUID NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "permanent" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" "RedirectSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redirects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "redirects_from_path_key" ON "redirects"("from_path");

-- CreateIndex
CREATE INDEX "redirects_to_path_idx" ON "redirects"("to_path");


-- Row Level Security on every table (CLAUDE.md §7): no policy = no access through
-- Supabase's public API; only the server (which bypasses RLS) reads and writes it.
ALTER TABLE "redirects" ENABLE ROW LEVEL SECURITY;
