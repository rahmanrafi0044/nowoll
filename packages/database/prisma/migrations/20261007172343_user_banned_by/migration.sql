-- Step 32: who banned a customer account, and when (cleared on unban).
-- SET NULL: removing a staff member's row never deletes the record that a ban happened.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "banned_at" TIMESTAMP(3),
ADD COLUMN     "banned_by_id" UUID;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_banned_by_id_fkey" FOREIGN KEY ("banned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

