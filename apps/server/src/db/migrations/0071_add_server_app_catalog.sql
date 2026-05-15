CREATE TABLE IF NOT EXISTS "server_app_catalog_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_key" varchar(80) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "icon_url" text,
  "manifest_url" text,
  "manifest" jsonb NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "server_app_catalog_entries_app_key_unique"
  ON "server_app_catalog_entries" ("app_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_app_catalog_entries_status_idx"
  ON "server_app_catalog_entries" ("status");
