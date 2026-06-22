CREATE TABLE IF NOT EXISTS "cloud_git_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(32) DEFAULT 'github' NOT NULL,
  "name" varchar(255) NOT NULL,
  "account_login" varchar(255) NOT NULL,
  "account_name" varchar(255),
  "token_encrypted" text NOT NULL,
  "scopes" jsonb,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_git_connections_user_id_idx"
  ON "cloud_git_connections" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_git_connections_provider_idx"
  ON "cloud_git_connections" ("provider");
