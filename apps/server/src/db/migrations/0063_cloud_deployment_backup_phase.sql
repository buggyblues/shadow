ALTER TABLE "cloud_deployment_backups"
  ADD COLUMN IF NOT EXISTS "phase" varchar(64) DEFAULT 'queued' NOT NULL;
