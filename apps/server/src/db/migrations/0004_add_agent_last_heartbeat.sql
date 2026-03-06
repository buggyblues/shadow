ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "last_heartbeat" timestamp with time zone;
