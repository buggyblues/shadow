DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_strategy') THEN
    CREATE TYPE "public"."notification_strategy" AS ENUM('all', 'mention_only', 'none');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "strategy" "notification_strategy" DEFAULT 'all' NOT NULL,
  "muted_server_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
  "muted_channel_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_notification_preferences_user" ON "notification_preferences" ("user_id");
