-- Some long-lived databases created cloud lifecycle tables before migration 0037.
-- CREATE TABLE IF NOT EXISTS preserved those tables, but could not add the foreign
-- keys declared inside the skipped CREATE TABLE statements. Restore the lifecycle
-- constraints by relationship (rather than by name) so this migration is safe on
-- both upgraded and freshly-created databases.

DO $$
BEGIN
  IF to_regclass('public.cloud_deployments') IS NOT NULL
    AND to_regclass('public.users') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_record
      WHERE constraint_record.contype = 'f'
        AND constraint_record.conrelid = 'public.cloud_deployments'::regclass
        AND constraint_record.confrelid = 'public.users'::regclass
        AND constraint_record.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute attribute
            WHERE attribute.attrelid = 'public.cloud_deployments'::regclass
              AND attribute.attname = 'user_id'
          )
        ]::smallint[]
    )
  THEN
    ALTER TABLE "cloud_deployments"
      ADD CONSTRAINT "cloud_deployments_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE NOT VALID;

    ALTER TABLE "cloud_deployments"
      VALIDATE CONSTRAINT "cloud_deployments_user_id_users_id_fk";
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.cloud_deployments') IS NOT NULL
    AND to_regclass('public.cloud_clusters') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_record
      WHERE constraint_record.contype = 'f'
        AND constraint_record.conrelid = 'public.cloud_deployments'::regclass
        AND constraint_record.confrelid = 'public.cloud_clusters'::regclass
        AND constraint_record.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute attribute
            WHERE attribute.attrelid = 'public.cloud_deployments'::regclass
              AND attribute.attname = 'cluster_id'
          )
        ]::smallint[]
    )
  THEN
    ALTER TABLE "cloud_deployments"
      ADD CONSTRAINT "cloud_deployments_cluster_id_cloud_clusters_id_fk"
      FOREIGN KEY ("cluster_id") REFERENCES "cloud_clusters"("id")
      ON DELETE SET NULL NOT VALID;

    ALTER TABLE "cloud_deployments"
      VALIDATE CONSTRAINT "cloud_deployments_cluster_id_cloud_clusters_id_fk";
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.cloud_deployment_logs') IS NOT NULL
    AND to_regclass('public.cloud_deployments') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_record
      WHERE constraint_record.contype = 'f'
        AND constraint_record.conrelid = 'public.cloud_deployment_logs'::regclass
        AND constraint_record.confrelid = 'public.cloud_deployments'::regclass
        AND constraint_record.conkey = ARRAY[
          (
            SELECT attribute.attnum
            FROM pg_attribute attribute
            WHERE attribute.attrelid = 'public.cloud_deployment_logs'::regclass
              AND attribute.attname = 'deployment_id'
          )
        ]::smallint[]
    )
  THEN
    ALTER TABLE "cloud_deployment_logs"
      ADD CONSTRAINT "cloud_deployment_logs_deployment_id_cloud_deployments_id_fk"
      FOREIGN KEY ("deployment_id") REFERENCES "cloud_deployments"("id")
      ON DELETE CASCADE NOT VALID;

    ALTER TABLE "cloud_deployment_logs"
      VALIDATE CONSTRAINT "cloud_deployment_logs_deployment_id_cloud_deployments_id_fk";
  END IF;
END $$;
