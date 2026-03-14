-- Track agent's totalOnlineSeconds at last billing for incremental settlement
ALTER TABLE rental_contracts ADD COLUMN IF NOT EXISTS last_billed_online_seconds integer NOT NULL DEFAULT 0;
