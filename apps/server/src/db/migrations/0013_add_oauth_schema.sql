-- OAuth Apps (developer-registered applications)
CREATE TABLE IF NOT EXISTS "oauth_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_id" varchar(64) NOT NULL UNIQUE,
  "client_secret_hash" text NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "homepage_url" text,
  "logo_url" text,
  "redirect_uris" jsonb NOT NULL DEFAULT '[]',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- OAuth Authorization Codes
CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(128) NOT NULL UNIQUE,
  "app_id" uuid NOT NULL REFERENCES "oauth_apps"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redirect_uri" text NOT NULL,
  "scope" varchar(255) NOT NULL DEFAULT 'user:read',
  "expires_at" timestamp with time zone NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- OAuth Access Tokens
CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash" varchar(128) NOT NULL UNIQUE,
  "app_id" uuid NOT NULL REFERENCES "oauth_apps"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scope" varchar(255) NOT NULL DEFAULT 'user:read',
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- OAuth Refresh Tokens
CREATE TABLE IF NOT EXISTS "oauth_refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash" varchar(128) NOT NULL UNIQUE,
  "access_token_id" uuid NOT NULL REFERENCES "oauth_access_tokens"("id") ON DELETE CASCADE,
  "app_id" uuid NOT NULL REFERENCES "oauth_apps"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- OAuth Consents (user authorization records)
CREATE TABLE IF NOT EXISTS "oauth_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "app_id" uuid NOT NULL REFERENCES "oauth_apps"("id") ON DELETE CASCADE,
  "scope" varchar(255) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- OAuth Accounts (third-party login associations)
CREATE TABLE IF NOT EXISTS "oauth_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(32) NOT NULL,
  "provider_account_id" varchar(255) NOT NULL,
  "provider_email" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_oauth_apps_user_id" ON "oauth_apps"("user_id");
CREATE INDEX IF NOT EXISTS "idx_oauth_apps_client_id" ON "oauth_apps"("client_id");
CREATE INDEX IF NOT EXISTS "idx_oauth_auth_codes_code" ON "oauth_authorization_codes"("code");
CREATE INDEX IF NOT EXISTS "idx_oauth_auth_codes_app_id" ON "oauth_authorization_codes"("app_id");
CREATE INDEX IF NOT EXISTS "idx_oauth_access_tokens_hash" ON "oauth_access_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "idx_oauth_refresh_tokens_hash" ON "oauth_refresh_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "idx_oauth_consents_user_app" ON "oauth_consents"("user_id", "app_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_oauth_accounts_provider" ON "oauth_accounts"("provider", "provider_account_id");
CREATE INDEX IF NOT EXISTS "idx_oauth_accounts_user_id" ON "oauth_accounts"("user_id");
