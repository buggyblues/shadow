-- Create channel_posting_rules table for channel posting restrictions
CREATE TABLE IF NOT EXISTS "channel_posting_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "rule_type" varchar(50) NOT NULL DEFAULT 'everyone',
  "config" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  UNIQUE("channel_id")
);

-- Create index for fast rule lookups by channel
CREATE INDEX IF NOT EXISTS "channel_posting_rules_channel_id_idx" ON "channel_posting_rules" ("channel_id");

-- Create index for rule type filtering
CREATE INDEX IF NOT EXISTS "channel_posting_rules_type_idx" ON "channel_posting_rules" ("rule_type");
