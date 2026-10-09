-- Step 35: when a returned parcel arrived (set by the "received" step; older returns stay null).
-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "received_at" TIMESTAMP(3);

