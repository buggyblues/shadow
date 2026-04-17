-- Config management platform tables

-- Enum for environments (idempotent)
DO $$ BEGIN
  CREATE TYPE "config_env" AS ENUM ('dev', 'staging', 'prod');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Schema registry
CREATE TABLE IF NOT EXISTS "config_schemas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "json_schema" jsonb NOT NULL,
  "ui_schema" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "config_schemas_name_unique" UNIQUE("name")
);

-- Config values with versioning
CREATE TABLE IF NOT EXISTS "config_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "schema_id" uuid NOT NULL REFERENCES "config_schemas"("id") ON DELETE CASCADE,
  "environment" "config_env" NOT NULL,
  "version" integer NOT NULL,
  "data" jsonb NOT NULL,
  "is_published" boolean NOT NULL DEFAULT false,
  "published_at" timestamptz,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "config_values_schema_env_version_uniq" UNIQUE("schema_id", "environment", "version")
);

CREATE INDEX IF NOT EXISTS "config_values_schema_env_idx" ON "config_values"("schema_id", "environment");

-- Feature flags
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "description" text,
  "envs" jsonb NOT NULL DEFAULT '{"dev":false,"staging":false,"prod":false}',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
