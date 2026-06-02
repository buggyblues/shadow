CREATE TABLE IF NOT EXISTS "channel_content_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE cascade,
  "status" varchar(24) DEFAULT 'active' NOT NULL,
  "include_kinds" varchar(24)[] DEFAULT ARRAY['image','html','pdf','file','voice','card']::varchar(24)[] NOT NULL,
  "exclude_mime_types" varchar(120)[] DEFAULT ARRAY[]::varchar(120)[] NOT NULL,
  "min_attachment_size" integer,
  "max_attachment_size" integer,
  "push_enabled" boolean DEFAULT true NOT NULL,
  "digest_mode" varchar(24) DEFAULT 'realtime' NOT NULL,
  "rule_customized" boolean DEFAULT false NOT NULL,
  "last_read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_content_subscriptions_user_channel_unique"
  ON "channel_content_subscriptions" ("user_id", "channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_content_subscriptions_user_status_idx"
  ON "channel_content_subscriptions" ("user_id", "status", "channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_content_subscriptions_channel_status_idx"
  ON "channel_content_subscriptions" ("channel_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_content_subscriptions_server_idx"
  ON "channel_content_subscriptions" ("server_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "channel_content_subscriptions"
    ADD CONSTRAINT "channel_content_subscriptions_status_check"
    CHECK ("status" IN ('active', 'paused'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "channel_content_subscriptions"
    ADD CONSTRAINT "channel_content_subscriptions_digest_mode_check"
    CHECK ("digest_mode" IN ('realtime', 'daily', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_feed_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE cascade,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" varchar(240) NOT NULL,
  "summary" text,
  "content_kinds" varchar(24)[] DEFAULT ARRAY[]::varchar(24)[] NOT NULL,
  "primary_attachment_id" uuid REFERENCES "attachments"("id") ON DELETE set null,
  "primary_attachment_content_type" varchar(120),
  "primary_attachment_size" integer,
  "attachment_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
  "card_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "published_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_feed_items_message_unique"
  ON "content_feed_items" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_feed_items_channel_published_idx"
  ON "content_feed_items" ("channel_id", "published_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_feed_items_server_published_idx"
  ON "content_feed_items" ("server_id", "published_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_feed_items_published_idx"
  ON "content_feed_items" ("published_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_feed_items_score_published_idx"
  ON "content_feed_items" ("score", "published_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_feed_items_kinds_idx"
  ON "content_feed_items" USING gin ("content_kinds");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_feed_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "feed_item_id" uuid NOT NULL REFERENCES "content_feed_items"("id") ON DELETE cascade,
  "state" varchar(24) NOT NULL,
  "last_position" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_feed_events_user_item_unique"
  ON "content_feed_events" ("user_id", "feed_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_feed_events_user_state_idx"
  ON "content_feed_events" ("user_id", "state", "updated_at");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "content_feed_events"
    ADD CONSTRAINT "content_feed_events_state_check"
    CHECK ("state" IN ('seen', 'opened', 'saved', 'hidden', 'dismissed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
