CREATE TABLE "cloud_connector_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" varchar(128) NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"credential_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile" jsonb,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_computer_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cloud_computer_id" varchar(128) NOT NULL,
	"plugin_id" varchar(128) NOT NULL,
	"connection_id" uuid NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"declared_in_base" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'configured' NOT NULL,
	"target_deployment_id" uuid,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_connector_connections" ADD CONSTRAINT "cloud_connector_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cloud_computer_connectors" ADD CONSTRAINT "cloud_computer_connectors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cloud_computer_connectors" ADD CONSTRAINT "cloud_computer_connectors_connection_id_cloud_connector_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."cloud_connector_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cloud_computer_connectors" ADD CONSTRAINT "cloud_computer_connectors_target_deployment_id_cloud_deployments_id_fk" FOREIGN KEY ("target_deployment_id") REFERENCES "public"."cloud_deployments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_connector_connections_user_plugin_unique_idx" ON "cloud_connector_connections" USING btree ("user_id","plugin_id");
--> statement-breakpoint
CREATE INDEX "cloud_connector_connections_user_id_idx" ON "cloud_connector_connections" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_computer_connectors_scope_unique_idx" ON "cloud_computer_connectors" USING btree ("user_id","cloud_computer_id","plugin_id");
--> statement-breakpoint
CREATE INDEX "cloud_computer_connectors_computer_idx" ON "cloud_computer_connectors" USING btree ("user_id","cloud_computer_id");
--> statement-breakpoint
CREATE INDEX "cloud_computer_connectors_connection_idx" ON "cloud_computer_connectors" USING btree ("connection_id");
