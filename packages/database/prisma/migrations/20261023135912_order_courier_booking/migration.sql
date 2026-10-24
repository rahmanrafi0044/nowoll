-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "courier_consignment_id" TEXT,
ADD COLUMN     "courier_status" TEXT,
ADD COLUMN     "courier_status_at" TIMESTAMP(3);
