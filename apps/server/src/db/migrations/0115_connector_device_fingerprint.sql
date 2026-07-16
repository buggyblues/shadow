ALTER TABLE "connector_computers" ADD COLUMN IF NOT EXISTS "device_fingerprint" varchar(128);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "connector_computers_user_device_fingerprint_unique_idx"
  ON "connector_computers" USING btree ("user_id", "device_fingerprint")
  WHERE "device_fingerprint" IS NOT NULL AND "revoked_at" IS NULL;
