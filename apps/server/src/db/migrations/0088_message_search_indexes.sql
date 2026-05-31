-- Accelerate scoped message search:
--   WHERE channel_id IN (...) AND lower(content) LIKE '%query%'

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_content_trgm_idx"
  ON "messages" USING gin (lower("content") gin_trgm_ops);
