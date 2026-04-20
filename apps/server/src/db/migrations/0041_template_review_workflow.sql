-- Template Review Workflow: Add 'draft' status and review_note column

-- Add 'draft' value to the review status enum
DO $$ BEGIN
  ALTER TYPE "cloud_template_review_status" ADD VALUE IF NOT EXISTS 'draft';
EXCEPTION WHEN others THEN NULL; END $$;

-- Add review_note column for admin rejection reasons
ALTER TABLE "cloud_templates"
  ADD COLUMN IF NOT EXISTS "review_note" text;

-- Templates submitted without content editing should start as draft
-- Existing pending community templates stay pending (already submitted)
