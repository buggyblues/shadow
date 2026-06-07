CREATE TABLE "buddy_collaborations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL,
  "root_message_id" uuid NOT NULL,
  "mode" text DEFAULT 'collab' NOT NULL,
  "state" text DEFAULT 'open' NOT NULL,
  "active_buddy_id" uuid,
  "mentioned_buddy_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "turn" integer DEFAULT 0 NOT NULL,
  "max_turns" integer DEFAULT 4 NOT NULL,
  "thread_id" uuid,
  "last_message_id" uuid,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "buddy_collaborations_channel_id_channels_id_fk"
    FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE cascade,
  CONSTRAINT "buddy_collaborations_root_message_id_messages_id_fk"
    FOREIGN KEY ("root_message_id") REFERENCES "messages"("id") ON DELETE cascade,
  CONSTRAINT "buddy_collaborations_channel_root_unique"
    UNIQUE ("channel_id", "root_message_id")
);
--> statement-breakpoint
CREATE INDEX "buddy_collaborations_channel_state_idx"
  ON "buddy_collaborations" ("channel_id", "state");
--> statement-breakpoint
CREATE INDEX "buddy_collaborations_root_idx"
  ON "buddy_collaborations" ("root_message_id");
