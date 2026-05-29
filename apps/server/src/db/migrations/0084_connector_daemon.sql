CREATE TABLE IF NOT EXISTS "connector_computers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" varchar(128) NOT NULL,
  "token_hash" varchar(128) NOT NULL UNIQUE,
  "hostname" varchar(255),
  "os" varchar(64),
  "arch" varchar(64),
  "daemon_version" varchar(64),
  "runtimes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_computers_user_id_idx"
  ON "connector_computers" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_computers_token_hash_idx"
  ON "connector_computers" ("token_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connector_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "computer_id" uuid NOT NULL REFERENCES "connector_computers"("id") ON DELETE cascade,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE set null,
  "type" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "payload_encrypted" text NOT NULL,
  "result" jsonb,
  "error" text,
  "claimed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_jobs_computer_status_idx"
  ON "connector_jobs" ("computer_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_jobs_user_id_idx"
  ON "connector_jobs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_jobs_agent_id_idx"
  ON "connector_jobs" ("agent_id");
