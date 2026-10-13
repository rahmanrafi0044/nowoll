-- AlterTable
ALTER TABLE "subscribers" ADD COLUMN     "resend_error" TEXT,
ADD COLUMN     "resend_synced_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "subscribers_status_created_at_idx" ON "subscribers"("status", "created_at");

