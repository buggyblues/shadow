ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "wallpaper_type" varchar(16);
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "wallpaper_url" text;
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "wallpaper_workspace_file_id" uuid;
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "wallpaper_interactive" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "wallpaper_updated_at" timestamp with time zone;
