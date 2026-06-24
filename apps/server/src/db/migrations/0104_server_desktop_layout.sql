ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "desktop_layout" jsonb NOT NULL DEFAULT '{"version":1,"items":[],"widgets":[]}'::jsonb;
