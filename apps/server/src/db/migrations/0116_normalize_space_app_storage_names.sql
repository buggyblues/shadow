-- Earlier releases used the `server_app_*` storage names. The Space App rename
-- intentionally keeps the same records and identifiers, but databases that had
-- already applied those migrations do not replay the renamed migration files.
-- Normalize those existing databases in place so the runtime schema and the
-- Drizzle schema cannot diverge.

DO $$
DECLARE
  rename_pair text[];
BEGIN
  FOREACH rename_pair SLICE 1 IN ARRAY ARRAY[
    ['server_app_integrations', 'space_app_installations'],
    ['server_app_catalog_entries', 'space_app_catalog_entries'],
    ['server_app_command_tokens', 'space_app_command_tokens'],
    ['server_app_command_consents', 'space_app_command_consents'],
    ['server_app_buddy_grants', 'space_app_buddy_grants'],
    ['app_notification_topics', 'space_app_notification_topics'],
    ['app_notification_preferences', 'space_app_notification_preferences']
  ]
  LOOP
    IF to_regclass('public.' || rename_pair[1]) IS NOT NULL THEN
      IF to_regclass('public.' || rename_pair[2]) IS NOT NULL THEN
        RAISE EXCEPTION
          'Cannot normalize Space App storage: both % and % exist',
          rename_pair[1],
          rename_pair[2];
      END IF;

      EXECUTE format('ALTER TABLE %I RENAME TO %I', rename_pair[1], rename_pair[2]);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

DO $$
DECLARE
  rename_spec text[];
  table_name text;
  old_column text;
  new_column text;
  has_old boolean;
  has_new boolean;
BEGIN
  FOREACH rename_spec SLICE 1 IN ARRAY ARRAY[
    ['space_app_command_tokens', 'server_app_id', 'space_app_id'],
    ['space_app_command_consents', 'server_app_id', 'space_app_id'],
    ['space_app_buddy_grants', 'server_app_id', 'space_app_id'],
    ['space_app_notification_topics', 'server_app_id', 'space_app_id'],
    ['space_app_notification_preferences', 'server_app_id', 'space_app_id'],
    ['cloud_app_instances', 'server_app_integration_id', 'space_app_installation_id'],
    ['cloud_app_releases', 'server_app_integration_id', 'space_app_installation_id'],
    ['notifications', 'source_app_id', 'source_space_app_id'],
    ['notifications', 'source_app_key', 'source_space_app_key'],
    ['notifications', 'source_app_topic_key', 'source_space_app_topic_key'],
    ['notifications', 'source_app_event_key', 'source_space_app_event_key']
  ]
  LOOP
    table_name := rename_spec[1];
    old_column := rename_spec[2];
    new_column := rename_spec[3];

    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = rename_spec[1]
        AND column_name = rename_spec[2]
    ) INTO has_old;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = rename_spec[1]
        AND column_name = rename_spec[3]
    ) INTO has_new;

    IF has_old AND has_new THEN
      RAISE EXCEPTION
        'Cannot normalize Space App storage: %.% and %.% both exist',
        table_name,
        old_column,
        table_name,
        new_column;
    END IF;

    IF has_old THEN
      EXECUTE format(
        'ALTER TABLE %I RENAME COLUMN %I TO %I',
        table_name,
        old_column,
        new_column
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- Use the current names for indexes introduced by the renamed schema. Existing
-- legacy indexes remain valid after a table/column rename; these statements are
-- intentionally idempotent and make fresh and upgraded databases converge.
CREATE UNIQUE INDEX IF NOT EXISTS "space_app_installations_space_app_key_unique"
  ON "space_app_installations" ("server_id", "app_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_installations_server_id_idx"
  ON "space_app_installations" ("server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_installations_app_key_idx"
  ON "space_app_installations" ("app_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "space_app_catalog_entries_app_key_unique"
  ON "space_app_catalog_entries" ("app_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_catalog_entries_status_idx"
  ON "space_app_catalog_entries" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "space_app_command_tokens_hash_unique"
  ON "space_app_command_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_command_tokens_app_expires_idx"
  ON "space_app_command_tokens" ("space_app_id", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_command_tokens_task_idx"
  ON "space_app_command_tokens" ("task_message_id", "task_card_id", "task_claim_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "space_app_command_consents_subject_unique"
  ON "space_app_command_consents" ("space_app_id", "command", "subject_kind", "subject_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_command_consents_space_app_id_idx"
  ON "space_app_command_consents" ("space_app_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_command_consents_subject_idx"
  ON "space_app_command_consents" ("subject_kind", "subject_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "space_app_buddy_grants_app_buddy_unique"
  ON "space_app_buddy_grants" ("space_app_id", "buddy_agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_buddy_grants_space_app_id_idx"
  ON "space_app_buddy_grants" ("space_app_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_buddy_grants_buddy_agent_id_idx"
  ON "space_app_buddy_grants" ("buddy_agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_notification_topics_server_idx"
  ON "space_app_notification_topics" ("server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "space_app_notification_preferences_user_idx"
  ON "space_app_notification_preferences" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_source_space_app_idx"
  ON "notifications" ("user_id", "source_space_app_id", "source_space_app_topic_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_source_space_app_event_unique"
  ON "notifications" ("user_id", "source_space_app_id", "source_space_app_event_key");
