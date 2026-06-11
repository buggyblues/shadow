CREATE TABLE IF NOT EXISTS "task_card_read_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "card_id" varchar(80) NOT NULL,
  "read_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "task_card_read_states_user_message_card_unique"
  ON "task_card_read_states" ("user_id", "message_id", "card_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_card_read_states_message_idx"
  ON "task_card_read_states" ("message_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_card_read_states_user_idx"
  ON "task_card_read_states" ("user_id");--> statement-breakpoint

UPDATE "messages" child
SET "thread_id" = parent."thread_id"
FROM "messages" parent
WHERE child."thread_id" IS NULL
  AND child."reply_to_id" = parent."id"
  AND parent."thread_id" IS NOT NULL;
