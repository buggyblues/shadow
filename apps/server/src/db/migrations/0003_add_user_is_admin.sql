ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false;
