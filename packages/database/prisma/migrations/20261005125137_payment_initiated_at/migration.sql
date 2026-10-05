-- When a payment attempt was sent to SSLCommerz (null = not sent yet). See Payment.initiatedAt.
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "initiated_at" TIMESTAMP(3);

