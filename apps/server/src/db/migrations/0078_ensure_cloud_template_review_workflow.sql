-- Repair databases that skipped 0041-0043 because their journal timestamps
-- were older than prior migrations in already-deployed environments.

ALTER TYPE "cloud_template_review_status" ADD VALUE IF NOT EXISTS 'draft';
--> statement-breakpoint
ALTER TABLE "cloud_templates" ADD COLUMN IF NOT EXISTS "review_note" text;
--> statement-breakpoint
ALTER TYPE "cloud_deployment_status" ADD VALUE IF NOT EXISTS 'cancelling';
--> statement-breakpoint
ALTER TYPE "cloud_activity_type" ADD VALUE IF NOT EXISTS 'template_delete';
