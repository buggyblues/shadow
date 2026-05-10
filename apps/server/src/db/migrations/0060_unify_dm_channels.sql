DO $$ BEGIN
  CREATE TYPE "public"."channel_kind" AS ENUM('server', 'dm');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "kind" "public"."channel_kind" DEFAULT 'server' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "server_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "dm_user_a_id" uuid;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "dm_user_b_id" uuid;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "dm_pair_key" varchar(80);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "channels" ADD CONSTRAINT "channels_dm_user_a_id_users_id_fk"
    FOREIGN KEY ("dm_user_a_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "channels" ADD CONSTRAINT "channels_dm_user_b_id_users_id_fk"
    FOREIGN KEY ("dm_user_b_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "channels" ADD CONSTRAINT "channels_scope_check" CHECK (
    (
      "kind" = 'server'
      AND "server_id" IS NOT NULL
      AND "dm_user_a_id" IS NULL
      AND "dm_user_b_id" IS NULL
      AND "dm_pair_key" IS NULL
    )
    OR
    (
      "kind" = 'dm'
      AND "server_id" IS NULL
      AND "dm_user_a_id" IS NOT NULL
      AND "dm_user_b_id" IS NOT NULL
      AND "dm_pair_key" IS NOT NULL
      AND "is_private" = true
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "channels_dm_pair_key_unique"
  ON "channels" ("dm_pair_key")
  WHERE "kind" = 'dm';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channels_kind_last_message_idx"
  ON "channels" ("kind", "last_message_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channels_dm_user_a_idx"
  ON "channels" ("dm_user_a_id")
  WHERE "kind" = 'dm';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channels_dm_user_b_idx"
  ON "channels" ("dm_user_b_id")
  WHERE "kind" = 'dm';--> statement-breakpoint

UPDATE "notifications"
SET "scope_channel_id" = "scope_dm_channel_id"
WHERE "scope_channel_id" IS NULL AND "scope_dm_channel_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "notifications_scope_dm_channel_idx";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "scope_dm_channel_id";--> statement-breakpoint

INSERT INTO "channels" (
  "id",
  "kind",
  "name",
  "type",
  "server_id",
  "dm_user_a_id",
  "dm_user_b_id",
  "dm_pair_key",
  "topic",
  "position",
  "is_private",
  "last_message_at",
  "is_archived",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  'dm',
  'Direct Message',
  'text',
  NULL,
  "user_a_id",
  "user_b_id",
  "user_a_id"::text || ':' || "user_b_id"::text,
  NULL,
  0,
  true,
  "last_message_at",
  false,
  "created_at",
  "created_at"
FROM "dm_channels"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "channel_members" ("channel_id", "user_id", "joined_at")
SELECT "id", "user_a_id", "created_at" FROM "dm_channels"
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "channel_members" ("channel_id", "user_id", "joined_at")
SELECT "id", "user_b_id", "created_at" FROM "dm_channels"
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "messages" (
  "id",
  "content",
  "channel_id",
  "author_id",
  "thread_id",
  "reply_to_id",
  "is_edited",
  "is_pinned",
  "metadata",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "content",
  "dm_channel_id",
  "author_id",
  NULL,
  "reply_to_id",
  "is_edited",
  false,
  "metadata",
  "created_at",
  "updated_at"
FROM "dm_messages"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "attachments" (
  "id",
  "message_id",
  "filename",
  "url",
  "content_type",
  "size",
  "width",
  "height",
  "workspace_node_id",
  "created_at"
)
SELECT
  "id",
  "dm_message_id",
  "filename",
  "url",
  "content_type",
  "size",
  "width",
  "height",
  NULL,
  "created_at"
FROM "dm_attachments"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "reactions" (
  "id",
  "message_id",
  "user_id",
  "emoji",
  "created_at"
)
SELECT
  "id",
  "dm_message_id",
  "user_id",
  "emoji",
  "created_at"
FROM "dm_reactions"
ON CONFLICT DO NOTHING;--> statement-breakpoint

DROP TABLE IF EXISTS "dm_reactions";--> statement-breakpoint
DROP TABLE IF EXISTS "dm_attachments";--> statement-breakpoint
DROP TABLE IF EXISTS "dm_messages";--> statement-breakpoint
DROP TABLE IF EXISTS "dm_channels";
