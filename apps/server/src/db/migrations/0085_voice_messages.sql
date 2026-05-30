ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "kind" varchar(24) DEFAULT 'file' NOT NULL;
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "duration_ms" integer;
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "audio_codec" varchar(32);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "audio_container" varchar(32);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "waveform_peaks" jsonb;
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "waveform_version" integer;
--> statement-breakpoint
UPDATE "attachments"
SET "kind" = 'image'
WHERE "kind" = 'file' AND "content_type" LIKE 'image/%';
--> statement-breakpoint
UPDATE "attachments"
SET "kind" = 'voice'
WHERE "kind" = 'file' AND "content_type" LIKE 'audio/%' AND "duration_ms" IS NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attachments"
    ADD CONSTRAINT "attachments_kind_check"
    CHECK ("kind" IN ('file', 'image', 'voice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_kind_idx" ON "attachments" ("kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_message_playbacks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attachment_id" uuid NOT NULL REFERENCES "attachments"("id") ON DELETE cascade,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "first_played_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_played_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "last_position_ms" integer DEFAULT 0 NOT NULL,
  "play_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "voice_message_playbacks_attachment_user_unique"
  ON "voice_message_playbacks" ("attachment_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_message_playbacks_message_user_idx"
  ON "voice_message_playbacks" ("message_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_message_playbacks_attachment_completed_idx"
  ON "voice_message_playbacks" ("attachment_id", "completed_at");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "voice_message_playbacks"
    ADD CONSTRAINT "voice_message_playbacks_position_nonnegative"
    CHECK ("last_position_ms" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "voice_message_playbacks"
    ADD CONSTRAINT "voice_message_playbacks_play_count_positive"
    CHECK ("play_count" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_transcripts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attachment_id" uuid NOT NULL REFERENCES "attachments"("id") ON DELETE cascade,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "language" varchar(32),
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "text" text,
  "source" varchar(32) NOT NULL,
  "provider" varchar(80),
  "confidence" double precision,
  "error_code" varchar(80),
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "voice_transcripts_attachment_unique"
  ON "voice_transcripts" ("attachment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_transcripts_message_idx"
  ON "voice_transcripts" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_transcripts_status_idx"
  ON "voice_transcripts" ("status");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "voice_transcripts"
    ADD CONSTRAINT "voice_transcripts_status_check"
    CHECK ("status" IN ('pending', 'processing', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "voice_transcripts"
    ADD CONSTRAINT "voice_transcripts_source_check"
    CHECK ("source" IN ('client', 'server', 'runtime'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "voice_transcripts"
    ADD CONSTRAINT "voice_transcripts_confidence_check"
    CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
