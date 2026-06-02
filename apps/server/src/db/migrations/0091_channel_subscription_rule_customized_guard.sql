-- Ensure channel subscriptions can distinguish default subscriptions from
-- per-channel customized rules on databases that applied an earlier 0089.

ALTER TABLE "channel_content_subscriptions"
  ADD COLUMN IF NOT EXISTS "rule_customized" boolean DEFAULT false NOT NULL;
