CREATE TABLE IF NOT EXISTS "cloud_exposures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "deployment_id" uuid NOT NULL REFERENCES "cloud_deployments"("id") ON DELETE cascade,
  "server_id" uuid REFERENCES "servers"("id") ON DELETE set null,
  "app_instance_id" uuid,
  "app_release_id" uuid,
  "agent_id" varchar(255) NOT NULL,
  "local_id" varchar(64) NOT NULL,
  "source" varchar(32) DEFAULT 'runtime' NOT NULL,
  "exposure_kind" varchar(32) DEFAULT 'http_service' NOT NULL,
  "release_mode" varchar(32) DEFAULT 'preview' NOT NULL,
  "visibility" varchar(32) DEFAULT 'private' NOT NULL,
  "auth_mode" varchar(32) DEFAULT 'shadow_session' NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "host" varchar(255) NOT NULL,
  "stable_host" varchar(255),
  "public_base_url" text NOT NULL,
  "manifest_url" text,
  "target_namespace" varchar(255) NOT NULL,
  "target_workload" varchar(255),
  "target_service_name" varchar(255),
  "target_port" integer NOT NULL,
  "health" jsonb,
  "policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dynamic_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_heartbeat_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "close_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "cloud_exposures_deployment_agent_local_unique_idx"
  ON "cloud_exposures" ("deployment_id", "agent_id", "local_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cloud_exposures_host_unique_idx"
  ON "cloud_exposures" ("host");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cloud_exposures_stable_host_unique_idx"
  ON "cloud_exposures" ("stable_host");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_exposures_deployment_idx" ON "cloud_exposures" ("deployment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_exposures_server_idx" ON "cloud_exposures" ("server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_exposures_status_idx" ON "cloud_exposures" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_exposures_lease_expires_at_idx" ON "cloud_exposures" ("lease_expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cloud_exposure_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exposure_id" uuid NOT NULL REFERENCES "cloud_exposures"("id") ON DELETE cascade,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "deployment_id" uuid REFERENCES "cloud_deployments"("id") ON DELETE set null,
  "event_type" varchar(64) NOT NULL,
  "actor_kind" varchar(32),
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "actor_agent_id" uuid REFERENCES "agents"("id") ON DELETE set null,
  "status" varchar(32),
  "message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cloud_exposure_events_exposure_idx" ON "cloud_exposure_events" ("exposure_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_exposure_events_deployment_idx" ON "cloud_exposure_events" ("deployment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_exposure_events_created_at_idx" ON "cloud_exposure_events" ("created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cloud_app_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "deployment_id" uuid NOT NULL REFERENCES "cloud_deployments"("id") ON DELETE cascade,
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE cascade,
  "server_app_integration_id" uuid REFERENCES "server_app_integrations"("id") ON DELETE set null,
  "agent_id" varchar(255) NOT NULL,
  "app_key" varchar(128) NOT NULL,
  "name" varchar(255) NOT NULL,
  "stable_host" varchar(255) NOT NULL,
  "stable_base_url" text NOT NULL,
  "manifest_url" text NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "current_release_id" uuid,
  "current_exposure_id" uuid,
  "source_path" text,
  "state_policy" jsonb DEFAULT '{"paths":[]}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "cloud_app_instances_scope_unique_idx"
  ON "cloud_app_instances" ("deployment_id", "agent_id", "server_id", "app_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cloud_app_instances_stable_host_unique_idx"
  ON "cloud_app_instances" ("stable_host");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_app_instances_server_idx" ON "cloud_app_instances" ("server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_app_instances_status_idx" ON "cloud_app_instances" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cloud_app_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_instance_id" uuid NOT NULL REFERENCES "cloud_app_instances"("id") ON DELETE cascade,
  "exposure_id" uuid REFERENCES "cloud_exposures"("id") ON DELETE set null,
  "server_app_integration_id" uuid REFERENCES "server_app_integrations"("id") ON DELETE set null,
  "version" varchar(128) NOT NULL,
  "code_sha" varchar(128) NOT NULL,
  "release_mode" varchar(32) DEFAULT 'installed' NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "manifest" jsonb NOT NULL,
  "manifest_url" text NOT NULL,
  "source_path" text,
  "artifact_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "activated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cloud_app_releases_instance_idx" ON "cloud_app_releases" ("app_instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_app_releases_code_sha_idx" ON "cloud_app_releases" ("code_sha");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cloud_backup_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "app_instance_id" uuid NOT NULL REFERENCES "cloud_app_instances"("id") ON DELETE cascade,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "driver" varchar(32) DEFAULT 'metadata' NOT NULL,
  "config" jsonb DEFAULT '{"statePaths":[]}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cloud_backup_policies_instance_idx" ON "cloud_backup_policies" ("app_instance_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cloud_backup_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "app_instance_id" uuid NOT NULL REFERENCES "cloud_app_instances"("id") ON DELETE cascade,
  "release_id" uuid REFERENCES "cloud_app_releases"("id") ON DELETE set null,
  "trigger" varchar(32) DEFAULT 'manual' NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "manifest_snapshot" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cloud_backup_sets_instance_idx" ON "cloud_backup_sets" ("app_instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_backup_sets_created_at_idx" ON "cloud_backup_sets" ("created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cloud_backup_components" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "backup_set_id" uuid NOT NULL REFERENCES "cloud_backup_sets"("id") ON DELETE cascade,
  "component_kind" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'succeeded' NOT NULL,
  "ref_kind" varchar(32),
  "ref_id" uuid,
  "object_key" text,
  "path" text,
  "checksum" varchar(128),
  "size_bytes" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cloud_backup_components_set_idx" ON "cloud_backup_components" ("backup_set_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cloud_restore_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "app_instance_id" uuid NOT NULL REFERENCES "cloud_app_instances"("id") ON DELETE cascade,
  "backup_set_id" uuid NOT NULL REFERENCES "cloud_backup_sets"("id") ON DELETE restrict,
  "safety_backup_set_id" uuid REFERENCES "cloud_backup_sets"("id") ON DELETE set null,
  "strategy" varchar(32) DEFAULT 'in_place' NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "phase" varchar(64) DEFAULT 'queued' NOT NULL,
  "error" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cloud_restore_jobs_instance_idx" ON "cloud_restore_jobs" ("app_instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_restore_jobs_backup_set_idx" ON "cloud_restore_jobs" ("backup_set_id");
--> statement-breakpoint
