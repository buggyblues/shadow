-- Track installed Server App manifest versions so deployed app updates can refresh automatically.
ALTER TABLE "server_app_integrations"
  ADD COLUMN IF NOT EXISTS "manifest_version" varchar(64),
  ADD COLUMN IF NOT EXISTS "manifest_updated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "manifest_fetched_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  ADD COLUMN IF NOT EXISTS "manifest_hash" text;

--> statement-breakpoint
UPDATE "server_app_integrations"
SET
  "manifest_version" = COALESCE("manifest_version", "manifest" ->> 'version'),
  "manifest_updated_at" = COALESCE(
    "manifest_updated_at",
    CASE
      WHEN "manifest" ? 'updatedAt' THEN ("manifest" ->> 'updatedAt')::timestamp with time zone
      ELSE NULL
    END
  ),
  "manifest_fetched_at" = COALESCE("manifest_fetched_at", NOW());
