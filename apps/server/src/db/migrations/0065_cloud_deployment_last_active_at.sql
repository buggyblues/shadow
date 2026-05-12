ALTER TABLE "cloud_deployments"
ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;

UPDATE "cloud_deployments"
SET "last_active_at" = COALESCE("updated_at", "created_at", now());
