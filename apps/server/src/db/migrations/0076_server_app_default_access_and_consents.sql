ALTER TABLE "server_app_integrations"
  ADD COLUMN IF NOT EXISTS "default_permissions" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint

ALTER TABLE "server_app_integrations"
  ADD COLUMN IF NOT EXISTS "default_approval_mode" varchar(24) NOT NULL DEFAULT 'none';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "server_app_command_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "server_app_id" uuid NOT NULL REFERENCES "server_app_integrations"("id") ON DELETE CASCADE,
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "app_key" varchar(80) NOT NULL,
  "command" varchar(120) NOT NULL,
  "permission" text NOT NULL,
  "subject_kind" varchar(24) NOT NULL,
  "subject_key" text NOT NULL,
  "subject_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "buddy_agent_id" uuid REFERENCES "agents"("id") ON DELETE CASCADE,
  "granted_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "approval_mode" varchar(24) NOT NULL,
  "expires_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "server_app_command_consents_subject_unique"
  ON "server_app_command_consents" (
    "server_app_id",
    "command",
    "subject_kind",
    "subject_key"
  );
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_app_command_consents_server_app_id_idx"
  ON "server_app_command_consents" ("server_app_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_app_command_consents_subject_idx"
  ON "server_app_command_consents" ("subject_kind", "subject_key");
