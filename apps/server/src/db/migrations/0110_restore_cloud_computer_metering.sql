UPDATE "cloud_deployments"
SET
	"hourly_cost" = 1,
	"updated_at" = now()
WHERE
	"saas_mode" = true
	AND "hourly_cost" = 0
	AND "config_snapshot" ? 'cloudComputer'
	-- Drizzle applies every pending migration in one transaction. Compare via text so
	-- fresh databases can run this after migrations 0061/0073 add enum labels; PostgreSQL
	-- otherwise rejects use of those labels until the transaction is committed.
	AND "status"::text IN ('pending', 'deploying', 'deployed', 'paused', 'resuming', 'failed');
