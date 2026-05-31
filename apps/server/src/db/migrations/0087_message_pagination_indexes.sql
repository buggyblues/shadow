-- Match chat history pagination access patterns:
--   root channel messages: WHERE channel_id = ? AND thread_id IS NULL ORDER BY created_at DESC
--   thread messages:       WHERE thread_id = ? ORDER BY created_at DESC

CREATE INDEX IF NOT EXISTS "messages_channel_root_created_at_desc_idx"
  ON "messages" ("channel_id", "created_at" DESC)
  WHERE "thread_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_created_at_desc_idx"
  ON "messages" ("thread_id", "created_at" DESC)
  WHERE "thread_id" IS NOT NULL;
