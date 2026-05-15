CREATE TABLE IF NOT EXISTS "server_app_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "app_key" varchar(80) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "icon_url" text,
  "manifest_url" text,
  "manifest" jsonb NOT NULL,
  "iframe_entry" text,
  "allowed_origins" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "api_base_url" text NOT NULL,
  "shared_secret_encrypted" text,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "installed_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "server_app_integrations_server_app_key_unique"
  ON "server_app_integrations" ("server_id", "app_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_app_integrations_server_id_idx"
  ON "server_app_integrations" ("server_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_app_integrations_app_key_idx"
  ON "server_app_integrations" ("app_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "server_app_buddy_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "server_app_id" uuid NOT NULL REFERENCES "server_app_integrations"("id") ON DELETE CASCADE,
  "buddy_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "resource_rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "approval_mode" varchar(24) NOT NULL DEFAULT 'none',
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "server_app_buddy_grants_app_buddy_unique"
  ON "server_app_buddy_grants" ("server_app_id", "buddy_agent_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_app_buddy_grants_server_app_id_idx"
  ON "server_app_buddy_grants" ("server_app_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_app_buddy_grants_buddy_agent_id_idx"
  ON "server_app_buddy_grants" ("buddy_agent_id");
