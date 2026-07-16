ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "source_app_id" uuid;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "source_app_key" varchar(80);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "source_app_topic_key" varchar(80);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "source_app_event_key" varchar(200);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_app_id_server_app_integrations_id_fk"
 FOREIGN KEY ("source_app_id") REFERENCES "public"."server_app_integrations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notifications_source_app_idx"
  ON "notifications" USING btree ("user_id", "source_app_id", "source_app_topic_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_source_app_event_unique"
  ON "notifications" USING btree ("user_id", "source_app_id", "source_app_event_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "app_notification_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "server_app_id" uuid NOT NULL,
  "server_id" uuid NOT NULL,
  "app_key" varchar(80) NOT NULL,
  "topic_key" varchar(80) NOT NULL,
  "title" varchar(120) NOT NULL,
  "description" text,
  "default_enabled" boolean DEFAULT true NOT NULL,
  "default_channels" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_notification_topics_unique" UNIQUE("server_app_id", "topic_key")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "app_notification_topics" ADD CONSTRAINT "app_notification_topics_server_app_id_server_app_integrations_id_fk"
 FOREIGN KEY ("server_app_id") REFERENCES "public"."server_app_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_notification_topics" ADD CONSTRAINT "app_notification_topics_server_id_servers_id_fk"
 FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_notification_topics_server_idx"
  ON "app_notification_topics" USING btree ("server_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "app_notification_preferences" (
  "user_id" uuid NOT NULL,
  "server_app_id" uuid NOT NULL,
  "topic_key" varchar(80) NOT NULL,
  "enabled" boolean NOT NULL,
  "channels" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_notification_preferences_unique" UNIQUE("user_id", "server_app_id", "topic_key")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "app_notification_preferences" ADD CONSTRAINT "app_notification_preferences_user_id_users_id_fk"
 FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_notification_preferences" ADD CONSTRAINT "app_notification_preferences_server_app_id_server_app_integrations_id_fk"
 FOREIGN KEY ("server_app_id") REFERENCES "public"."server_app_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_notification_preferences_user_idx"
  ON "app_notification_preferences" USING btree ("user_id");
