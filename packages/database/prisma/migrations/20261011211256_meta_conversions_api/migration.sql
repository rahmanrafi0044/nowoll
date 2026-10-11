-- CreateEnum
CREATE TYPE "MetaEventStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "order_tracking" (
    "order_id" UUID NOT NULL,
    "fbp" TEXT,
    "fbc" TEXT,
    "client_ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_tracking_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "meta_events" (
    "id" UUID NOT NULL,
    "order_id" UUID,
    "order_number" INTEGER,
    "event_name" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "status" "MetaEventStatus" NOT NULL,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "events_received" INTEGER,
    "message" TEXT,
    "fbtrace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_tracking_created_at_idx" ON "order_tracking"("created_at");

-- CreateIndex
CREATE INDEX "meta_events_created_at_idx" ON "meta_events"("created_at");

-- AddForeignKey
ALTER TABLE "order_tracking" ADD CONSTRAINT "order_tracking_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_events" ADD CONSTRAINT "meta_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row Level Security on every table (CLAUDE.md §7): no policy = no access through
-- Supabase's public API; only the server (which bypasses RLS) reads and writes them.
ALTER TABLE "order_tracking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meta_events" ENABLE ROW LEVEL SECURITY;
