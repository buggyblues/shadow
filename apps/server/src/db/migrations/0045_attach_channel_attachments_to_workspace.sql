ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "workspace_node_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_node_id_workspace_nodes_id_fk"
    FOREIGN KEY ("workspace_node_id") REFERENCES "public"."workspace_nodes"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_workspace_node_id_idx" ON "attachments" USING btree ("workspace_node_id");--> statement-breakpoint
