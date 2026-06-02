-- Ensure content subscription preferences exists for databases that applied
-- an earlier 0089_content_feed migration before the preferences table was added.

CREATE TABLE IF NOT EXISTS "content_subscription_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "include_kinds" varchar(24)[] DEFAULT ARRAY['image','html','pdf','file','voice','card']::varchar(24)[] NOT NULL,
  "push_enabled" boolean DEFAULT true NOT NULL,
  "digest_mode" varchar(24) DEFAULT 'realtime' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_subscription_preferences_user_unique"
  ON "content_subscription_preferences" ("user_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_subscription_preferences"
    ADD CONSTRAINT "content_subscription_preferences_digest_mode_check"
    CHECK ("digest_mode" IN ('realtime', 'daily', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
