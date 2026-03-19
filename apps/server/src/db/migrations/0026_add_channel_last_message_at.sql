-- Add last_message_at column to channels table for sorting by activity
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "last_message_at" timestamp with time zone;

-- Create index for efficient sorting by last_message_at
CREATE INDEX IF NOT EXISTS "channels_last_message_at_idx" ON "channels" ("last_message_at");
