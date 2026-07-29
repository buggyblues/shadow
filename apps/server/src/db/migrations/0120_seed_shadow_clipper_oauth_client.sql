ALTER TABLE "oauth_apps" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
UPDATE "oauth_apps"
SET
  "name" = 'Shadow Clipper',
  "description" = 'Official Shadow web clipper',
  "homepage_url" = 'https://shadowob.com',
  "redirect_uris" = '["https://*.chromiumapp.org/shadow"]'::jsonb,
  "public_client" = true,
  "is_active" = true,
  "updated_at" = NOW()
WHERE "client_id" = 'shadow-clipper';
--> statement-breakpoint
INSERT INTO "oauth_apps" (
  "client_id",
  "client_secret_hash",
  "name",
  "description",
  "homepage_url",
  "redirect_uris",
  "public_client",
  "is_active"
)
SELECT
  'shadow-clipper',
  '',
  'Shadow Clipper',
  'Official Shadow web clipper',
  'https://shadowob.com',
  '["https://*.chromiumapp.org/shadow"]'::jsonb,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "oauth_apps" WHERE "client_id" = 'shadow-clipper'
);
