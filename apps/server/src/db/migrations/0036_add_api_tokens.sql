CREATE TABLE IF NOT EXISTS "api_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "name" varchar(128) NOT NULL,
  "scope" varchar(255) NOT NULL DEFAULT 'user:read',
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "revoked" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);

CREATE INDEX IF NOT EXISTS "api_tokens_user_id_idx" ON "api_tokens" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "api_tokens_token_hash_idx" ON "api_tokens" USING btree ("token_hash");

DO $$ BEGIN
  ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
