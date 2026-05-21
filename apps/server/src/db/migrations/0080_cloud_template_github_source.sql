-- Server-owned template source metadata for GitHub-backed SaaS templates.
ALTER TABLE "cloud_templates"
  ADD COLUMN IF NOT EXISTS "github_source" jsonb;
