ALTER TABLE "oauth_apps" ALTER COLUMN "user_id" DROP NOT NULL;
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
) VALUES (
  'shadow-clipper',
  '',
  'Shadow Clipper',
  'Official Shadow web clipper',
  'https://shadowob.com',
  '["https://*.chromiumapp.org/shadow"]'::jsonb,
  true,
  true
)
ON CONFLICT ("client_id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "homepage_url" = EXCLUDED."homepage_url",
  "redirect_uris" = EXCLUDED."redirect_uris",
  "public_client" = true,
  "is_active" = true,
  "updated_at" = NOW();
