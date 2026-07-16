ALTER TABLE "connector_computers" ADD COLUMN IF NOT EXISTS "installation_id" varchar(128);
ALTER TABLE "connector_computers" ADD COLUMN IF NOT EXISTS "os_version" varchar(128);
ALTER TABLE "connector_computers" ADD COLUMN IF NOT EXISTS "device_class" varchar(32) DEFAULT 'unknown' NOT NULL;
ALTER TABLE "connector_computers" ADD COLUMN IF NOT EXISTS "device_vendor" varchar(128);
ALTER TABLE "connector_computers" ADD COLUMN IF NOT EXISTS "device_model" varchar(255);
ALTER TABLE "connector_computers" ADD COLUMN IF NOT EXISTS "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "connector_computers" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement-breakpoint

DROP INDEX IF EXISTS "connector_computers_user_installation_unique_idx";
CREATE UNIQUE INDEX "connector_computers_user_installation_unique_idx"
  ON "connector_computers" USING btree ("user_id", "installation_id")
  WHERE "installation_id" IS NOT NULL AND "revoked_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_computer_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "agent_id" uuid NOT NULL,
  "computer_kind" varchar(16) NOT NULL,
  "local_computer_id" uuid,
  "cloud_computer_id" varchar(128),
  "runtime_id" varchar(80) NOT NULL,
  "runtime_label" varchar(120),
  "work_dir" text,
  "status" varchar(32) DEFAULT 'configured' NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_computer_placements_kind_check"
    CHECK ("computer_kind" IN ('local', 'cloud')),
  CONSTRAINT "agent_computer_placements_target_check"
    CHECK (
      ("computer_kind" = 'local' AND "local_computer_id" IS NOT NULL AND "cloud_computer_id" IS NULL)
      OR
      ("computer_kind" = 'cloud' AND "local_computer_id" IS NULL AND "cloud_computer_id" IS NOT NULL)
    )
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "agent_computer_placements"
    ADD CONSTRAINT "agent_computer_placements_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "agent_computer_placements"
    ADD CONSTRAINT "agent_computer_placements_agent_id_agents_id_fk"
    FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "agent_computer_placements"
    ADD CONSTRAINT "agent_computer_placements_local_computer_id_connector_computers_id_fk"
    FOREIGN KEY ("local_computer_id") REFERENCES "public"."connector_computers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "agent_computer_placements_agent_unique_idx"
  ON "agent_computer_placements" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_computer_placements_user_idx"
  ON "agent_computer_placements" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "agent_computer_placements_local_idx"
  ON "agent_computer_placements" USING btree ("local_computer_id");
CREATE INDEX IF NOT EXISTS "agent_computer_placements_cloud_idx"
  ON "agent_computer_placements" USING btree ("cloud_computer_id");
--> statement-breakpoint

INSERT INTO "agent_computer_placements" (
  "user_id",
  "agent_id",
  "computer_kind",
  "local_computer_id",
  "runtime_id",
  "runtime_label",
  "work_dir",
  "status"
)
SELECT
  a."owner_id",
  a."id",
  'local',
  (a."config" ->> 'connectorComputerId')::uuid,
  COALESCE(NULLIF(a."config" ->> 'connectorRuntimeId', ''), a."kernel_type"),
  NULLIF(a."config" ->> 'connectorRuntimeLabel', ''),
  NULLIF(a."config" ->> 'connectorWorkDir', ''),
  CASE WHEN a."status" = 'error' THEN 'error' ELSE 'configured' END
FROM "agents" a
WHERE a."config" ->> 'connectorComputerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM "connector_computers" c
    WHERE c."id" = (a."config" ->> 'connectorComputerId')::uuid
      AND c."user_id" = a."owner_id"
  )
ON CONFLICT ("agent_id") DO NOTHING;
