ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "total_online_seconds" integer DEFAULT 0 NOT NULL;
