CREATE UNIQUE INDEX IF NOT EXISTS "space_app_notification_topics_unique"
  ON "space_app_notification_topics" ("space_app_id", "topic_key");
