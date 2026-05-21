-- Temporary Cloud deployments expire through the normal destroy queue.
ALTER TABLE "cloud_deployments"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS cloud_deployments_expires_at_idx
  ON cloud_deployments (expires_at);
