-- Rebuild cloud deployment namespace uniqueness after migration 0066.
-- Some existing databases already had the old active-status predicates under the
-- same index names, so CREATE INDEX IF NOT EXISTS did not update them.
DROP INDEX IF EXISTS cloud_deployments_platform_namespace_unique;
--> statement-breakpoint

CREATE UNIQUE INDEX cloud_deployments_platform_namespace_unique
  ON cloud_deployments (namespace)
  WHERE cluster_id IS NULL
    AND saas_mode = false
    AND status <> 'failed'
    AND status <> 'destroyed';
--> statement-breakpoint

DROP INDEX IF EXISTS cloud_deployments_cluster_namespace_unique;
--> statement-breakpoint

CREATE UNIQUE INDEX cloud_deployments_cluster_namespace_unique
  ON cloud_deployments (cluster_id, namespace)
  WHERE cluster_id IS NOT NULL
    AND saas_mode = false
    AND status <> 'failed'
    AND status <> 'destroyed';
