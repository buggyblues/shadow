-- OAuth Open Platform: extend schemas for buddies and wider scopes

-- Add OAuth app association and buddy parent to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oauth_app_id" uuid;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "parent_user_id" uuid;

-- Add OAuth app association and buddy user link to agents
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "oauth_app_id" uuid;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "buddy_user_id" uuid;

-- Widen scope columns from varchar(255) to varchar(1024) to support all 14 scopes
ALTER TABLE "oauth_authorization_codes" ALTER COLUMN "scope" TYPE varchar(1024);
ALTER TABLE "oauth_access_tokens" ALTER COLUMN "scope" TYPE varchar(1024);
ALTER TABLE "oauth_consents" ALTER COLUMN "scope" TYPE varchar(1024);
