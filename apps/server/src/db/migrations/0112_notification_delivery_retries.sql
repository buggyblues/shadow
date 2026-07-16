ALTER TYPE "notification_delivery_status" ADD VALUE IF NOT EXISTS 'dead_letter';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notification_deliveries_retry_idx"
  ON "notification_deliveries" USING btree ("status", "next_attempt_at");
