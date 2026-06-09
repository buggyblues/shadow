CREATE UNIQUE INDEX IF NOT EXISTS "server_app_integrations_server_app_key_unique"
  ON "server_app_integrations" ("server_id", "app_key");
