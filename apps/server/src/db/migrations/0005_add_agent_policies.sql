-- Agent policies: per-agent, per-server/channel strategy table
CREATE TABLE IF NOT EXISTS "agent_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "channel_id" uuid REFERENCES "channels"("id") ON DELETE CASCADE,
  "listen" boolean DEFAULT true NOT NULL,
  "reply" boolean DEFAULT true NOT NULL,
  "mention_only" boolean DEFAULT false NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Unique constraint: one policy per agent+server+channel combination
CREATE UNIQUE INDEX IF NOT EXISTS "agent_policies_unique"
  ON "agent_policies" ("agent_id", "server_id", COALESCE("channel_id", '00000000-0000-0000-0000-000000000000'));
