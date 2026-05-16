-- Repair cloud_deployment_status drift observed in long-lived production databases.
-- Earlier migrations introduced these values separately; this migration makes the
-- current application state machine idempotently true for every environment.
ALTER TYPE "cloud_deployment_status" ADD VALUE IF NOT EXISTS 'paused';
--> statement-breakpoint

ALTER TYPE "cloud_deployment_status" ADD VALUE IF NOT EXISTS 'resuming';
--> statement-breakpoint

ALTER TYPE "cloud_deployment_status" ADD VALUE IF NOT EXISTS 'cancelling';
