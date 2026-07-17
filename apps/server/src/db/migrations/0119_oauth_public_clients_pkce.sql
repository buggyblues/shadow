ALTER TABLE "oauth_apps" ADD COLUMN "public_client" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "code_challenge" varchar(128);
--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "code_challenge_method" varchar(16);
