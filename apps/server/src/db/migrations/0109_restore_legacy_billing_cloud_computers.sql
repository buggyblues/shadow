WITH latest_deployments AS (
	SELECT DISTINCT ON ("user_id", COALESCE("cluster_id"::text, 'platform'), "namespace")
		"id",
		"status",
		"error_message",
		"config_snapshot"
	FROM "cloud_deployments"
	ORDER BY
		"user_id",
		COALESCE("cluster_id"::text, 'platform'),
		"namespace",
		"updated_at" DESC,
		"created_at" DESC
), recoverable AS (
	SELECT "id"
	FROM latest_deployments
	WHERE
		"status" = 'destroyed'
		AND "error_message" = 'wallet insufficient for cloud hourly billing'
		AND "config_snapshot" ? 'cloudComputer'
)
UPDATE "cloud_deployments"
SET
	"status" = 'failed',
	"error_message" = 'runtime removed by legacy Cloud Computer billing policy; safe rebuild required',
	"updated_at" = now()
WHERE "id" IN (SELECT "id" FROM recoverable);
