CREATE TABLE IF NOT EXISTS "cloud_deployment_backups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "deployment_id" uuid NOT NULL,
  "namespace" varchar(255) NOT NULL,
  "agent_id" varchar(255) NOT NULL,
  "sandbox_name" varchar(255),
  "pvc_name" varchar(255) NOT NULL,
  "driver" varchar(32) DEFAULT 'volumeSnapshot' NOT NULL,
  "snapshot_name" varchar(255),
  "object_key" text,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "error" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cloud_deployment_backups_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "cloud_deployment_backups_deployment_id_cloud_deployments_id_fk"
    FOREIGN KEY ("deployment_id") REFERENCES "cloud_deployments"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "cloud_deployment_backups_deployment_id_idx"
  ON "cloud_deployment_backups" ("deployment_id");

CREATE INDEX IF NOT EXISTS "cloud_deployment_backups_user_id_idx"
  ON "cloud_deployment_backups" ("user_id");

CREATE INDEX IF NOT EXISTS "cloud_deployment_backups_agent_idx"
  ON "cloud_deployment_backups" ("namespace", "agent_id", "created_at");
