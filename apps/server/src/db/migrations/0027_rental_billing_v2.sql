-- Rental billing model v2: base daily fee + per-message fee + token fee + platform fee
-- Replaces time-based billing (hourly + electricity) for new listings/contracts.
-- Old contracts (pricing_version=1) continue using the legacy formula.

-- ── claw_listings: new pricing fields ──
ALTER TABLE claw_listings ADD COLUMN IF NOT EXISTS base_daily_rate integer NOT NULL DEFAULT 0;
ALTER TABLE claw_listings ADD COLUMN IF NOT EXISTS message_fee integer NOT NULL DEFAULT 0;
ALTER TABLE claw_listings ADD COLUMN IF NOT EXISTS pricing_version integer NOT NULL DEFAULT 1;

-- ── rental_contracts: new pricing fields + message tracking ──
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS base_daily_rate integer NOT NULL DEFAULT 0;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS message_fee integer NOT NULL DEFAULT 0;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS pricing_version integer NOT NULL DEFAULT 1;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS last_billed_daily_at timestamptz;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0;
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS last_billed_message_count integer NOT NULL DEFAULT 0;

-- ── rental_usage_records: new cost breakdown fields ──
ALTER TABLE rental_usage_records ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0;
ALTER TABLE rental_usage_records ADD COLUMN IF NOT EXISTS message_cost integer NOT NULL DEFAULT 0;
ALTER TABLE rental_usage_records ADD COLUMN IF NOT EXISTS base_rental_cost integer NOT NULL DEFAULT 0;
