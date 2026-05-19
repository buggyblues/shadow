CREATE TABLE IF NOT EXISTS "server_app_command_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash" text NOT NULL,
  "server_app_id" uuid NOT NULL REFERENCES "server_app_integrations"("id") ON DELETE CASCADE,
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "app_key" varchar(80) NOT NULL,
  "command" varchar(120) NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_kind" varchar(24) NOT NULL,
  "buddy_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "channel_id" uuid,
  "permission" text NOT NULL,
  "action" varchar(24) NOT NULL,
  "data_class" varchar(32) NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "server_app_command_tokens_hash_unique"
  ON "server_app_command_tokens" ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_app_command_tokens_app_expires_idx"
  ON "server_app_command_tokens" ("server_app_id", "expires_at");
