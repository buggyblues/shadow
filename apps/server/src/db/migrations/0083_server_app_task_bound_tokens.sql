ALTER TABLE "server_app_command_tokens" ADD COLUMN IF NOT EXISTS "task_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "server_app_command_tokens" ADD COLUMN IF NOT EXISTS "task_card_id" uuid;
--> statement-breakpoint
ALTER TABLE "server_app_command_tokens" ADD COLUMN IF NOT EXISTS "task_claim_id" uuid;
--> statement-breakpoint
ALTER TABLE "server_app_command_tokens" ADD COLUMN IF NOT EXISTS "task_workspace_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_app_command_tokens_task_idx"
  ON "server_app_command_tokens" ("task_message_id", "task_card_id", "task_claim_id");
