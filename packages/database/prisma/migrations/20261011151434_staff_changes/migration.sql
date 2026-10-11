-- Step 38e: the staff change log — who gave, changed or removed someone's admin
-- access, or reset their authenticator app, and when. Rows are only added.
-- actor SET NULL: removing the actor's row never deletes the record.
-- target CASCADE: users are soft-deleted; only a full erasure of that person
-- (a hard delete) removes their log rows too.

-- CreateEnum
CREATE TYPE "StaffChangeAction" AS ENUM ('GRANTED', 'ROLE_CHANGED', 'REVOKED', 'TWO_FACTOR_RESET');

-- CreateTable
CREATE TABLE "staff_changes" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "target_id" UUID NOT NULL,
    "action" "StaffChangeAction" NOT NULL,
    "from_role" "UserRole",
    "to_role" "UserRole",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_changes_created_at_idx" ON "staff_changes"("created_at");

-- AddForeignKey
ALTER TABLE "staff_changes" ADD CONSTRAINT "staff_changes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_changes" ADD CONSTRAINT "staff_changes_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security, like every table (CLAUDE.md §7; see the
-- 20261004201944_rls_and_check_constraints migration for why no policies):
-- the public Supabase API can't read or write it; our API (the owner) can.
ALTER TABLE "staff_changes" ENABLE ROW LEVEL SECURITY;
