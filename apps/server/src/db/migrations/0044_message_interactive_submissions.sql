CREATE TABLE IF NOT EXISTS "message_interactive_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_message_id" uuid NOT NULL,
  "block_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "action_id" text NOT NULL,
  "value" text NOT NULL,
  "values" jsonb,
  "response_message_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_interactive_submissions_source_message_id_messages_id_fk"
    FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE cascade,
  CONSTRAINT "message_interactive_submissions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "message_interactive_submissions_response_message_id_messages_id_fk"
    FOREIGN KEY ("response_message_id") REFERENCES "messages"("id") ON DELETE set null,
  CONSTRAINT "message_interactive_submissions_source_block_user_unique"
    UNIQUE ("source_message_id", "block_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "message_interactive_submissions_source_idx"
  ON "message_interactive_submissions" ("source_message_id");

CREATE INDEX IF NOT EXISTS "message_interactive_submissions_user_idx"
  ON "message_interactive_submissions" ("user_id");
