-- Add voice channel buddy policy support to agent_policies

-- Add type column to distinguish text vs voice policies
ALTER TABLE "agent_policies" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'text' NOT NULL;

-- Add index for faster voice policy lookups
CREATE INDEX IF NOT EXISTS "agent_policies_type_idx" ON "agent_policies" ("type");

-- Update unique constraint to include type
-- Drop old unique index
DROP INDEX IF EXISTS "agent_policies_unique";

-- Create new unique index that includes type
CREATE UNIQUE INDEX IF NOT EXISTS "agent_policies_unique"
  ON "agent_policies" ("agent_id", "server_id", COALESCE("channel_id", '00000000-0000-0000-0000-000000000000'), "type");
