CREATE TABLE IF NOT EXISTS "server_join_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "server_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  CONSTRAINT "server_join_requests_server_id_servers_id_fk"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE cascade,
  CONSTRAINT "server_join_requests_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "server_join_requests_reviewed_by_users_id_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE set null,
  CONSTRAINT "server_join_requests_server_user_unique"
    UNIQUE ("server_id", "user_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_join_requests_server_status_idx"
  ON "server_join_requests" ("server_id", "status");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "server_join_requests_user_status_idx"
  ON "server_join_requests" ("user_id", "status");
