-- AlterTable
ALTER TABLE "products" ADD COLUMN     "care" TEXT,
ADD COLUMN     "fabric" TEXT,
ADD COLUMN     "fit_note" TEXT,
ADD COLUMN     "ready_to_ship" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restocked_at" TIMESTAMP(3);
