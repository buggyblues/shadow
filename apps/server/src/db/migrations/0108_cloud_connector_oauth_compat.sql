ALTER TABLE "cloud_connector_connections" ADD COLUMN IF NOT EXISTS "auth_type" varchar(32) DEFAULT 'api-key' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cloud_connector_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" varchar(128) NOT NULL,
	"cloud_computer_id" varchar(128) NOT NULL,
	"state_hash" varchar(64) NOT NULL,
	"code_verifier_encrypted" text,
	"redirect_uri" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_connector_oauth_states_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'cloud_connector_oauth_states_user_id_users_id_fk'
	) THEN
		ALTER TABLE "cloud_connector_oauth_states"
			ADD CONSTRAINT "cloud_connector_oauth_states_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_connector_oauth_states_user_idx" ON "cloud_connector_oauth_states" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cloud_connector_oauth_states_expires_idx" ON "cloud_connector_oauth_states" USING btree ("expires_at");
