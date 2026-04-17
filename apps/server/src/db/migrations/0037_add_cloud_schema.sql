-- Add cloud SaaS schema: templates, clusters, deployments, logs, configs, env vars, activities

-- Enums
CREATE TYPE "cloud_deployment_status" AS ENUM (
  'pending', 'deploying', 'deployed', 'failed', 'destroying', 'destroyed'
);
CREATE TYPE "cloud_template_source" AS ENUM ('official', 'community');
CREATE TYPE "cloud_template_review_status" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "cloud_activity_type" AS ENUM (
  'deploy', 'destroy', 'scale', 'config_update',
  'cluster_add', 'cluster_remove', 'envvar_update', 'template_submit'
);

-- cloud_templates
CREATE TABLE IF NOT EXISTS "cloud_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(255) NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "source" "cloud_template_source" DEFAULT 'official' NOT NULL,
  "review_status" "cloud_template_review_status" DEFAULT 'approved' NOT NULL,
  "submitted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "content" jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cloud_templates_source_idx" ON "cloud_templates"("source");
CREATE INDEX IF NOT EXISTS "cloud_templates_review_status_idx" ON "cloud_templates"("review_status");

-- cloud_clusters
CREATE TABLE IF NOT EXISTS "cloud_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "kubeconfig_kms_ref" text,
  "kubeconfig_encrypted" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_platform" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cloud_clusters_user_id_idx" ON "cloud_clusters"("user_id");

-- cloud_deployments
CREATE TABLE IF NOT EXISTS "cloud_deployments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "cluster_id" uuid REFERENCES "cloud_clusters"("id") ON DELETE SET NULL,
  "namespace" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "status" "cloud_deployment_status" DEFAULT 'pending' NOT NULL,
  "agent_count" integer DEFAULT 0 NOT NULL,
  "config_snapshot" jsonb,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cloud_deployments_user_id_idx" ON "cloud_deployments"("user_id");
CREATE INDEX IF NOT EXISTS "cloud_deployments_status_idx" ON "cloud_deployments"("status");

-- cloud_deployment_logs
CREATE TABLE IF NOT EXISTS "cloud_deployment_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deployment_id" uuid NOT NULL REFERENCES "cloud_deployments"("id") ON DELETE CASCADE,
  "level" varchar(16) DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cloud_deployment_logs_deployment_id_idx" ON "cloud_deployment_logs"("deployment_id");

-- cloud_configs
CREATE TABLE IF NOT EXISTS "cloud_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "content" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cloud_configs_user_id_idx" ON "cloud_configs"("user_id");

-- cloud_env_groups
CREATE TABLE IF NOT EXISTS "cloud_env_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cloud_env_groups_user_id_idx" ON "cloud_env_groups"("user_id");

-- cloud_env_vars
CREATE TABLE IF NOT EXISTS "cloud_env_vars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "group_id" uuid REFERENCES "cloud_env_groups"("id") ON DELETE SET NULL,
  "scope" varchar(255) DEFAULT 'global' NOT NULL,
  "key" varchar(255) NOT NULL,
  "encrypted_value" text NOT NULL,
  "kms_key_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cloud_env_vars_user_id_idx" ON "cloud_env_vars"("user_id");
CREATE INDEX IF NOT EXISTS "cloud_env_vars_user_id_scope_key_idx" ON "cloud_env_vars"("user_id", "scope", "key");

-- cloud_activities
CREATE TABLE IF NOT EXISTS "cloud_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "cloud_activity_type" NOT NULL,
  "namespace" varchar(255),
  "meta" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "cloud_activities_user_id_idx" ON "cloud_activities"("user_id");
CREATE INDEX IF NOT EXISTS "cloud_activities_created_at_idx" ON "cloud_activities"("created_at");
