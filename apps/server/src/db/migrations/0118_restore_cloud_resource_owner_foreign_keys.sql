-- Migration 0037 used CREATE TABLE IF NOT EXISTS for the first Cloud tables.
-- Long-lived databases that already had those tables therefore missed the
-- ownership foreign keys declared inside CREATE TABLE. Remove only records
-- whose owner no longer exists, repair stale optional group references, and
-- restore the relationships expected by the current schema.

DELETE FROM "cloud_env_vars" resource
WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = resource."user_id");
--> statement-breakpoint

DELETE FROM "cloud_activities" resource
WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = resource."user_id");
--> statement-breakpoint

DELETE FROM "cloud_configs" resource
WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = resource."user_id");
--> statement-breakpoint

DELETE FROM "cloud_clusters" resource
WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = resource."user_id");
--> statement-breakpoint

DELETE FROM "cloud_env_groups" resource
WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = resource."user_id");
--> statement-breakpoint

UPDATE "cloud_env_vars" resource
SET "group_id" = NULL
WHERE resource."group_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "cloud_env_groups" resource_group
    WHERE resource_group."id" = resource."group_id"
  );
--> statement-breakpoint

DO $$
DECLARE
  relationship record;
BEGIN
  FOR relationship IN
    SELECT *
    FROM (
      VALUES
        (
          'cloud_clusters',
          'user_id',
          'users',
          'cloud_clusters_user_id_users_id_fk',
          'CASCADE'
        ),
        (
          'cloud_configs',
          'user_id',
          'users',
          'cloud_configs_user_id_users_id_fk',
          'CASCADE'
        ),
        (
          'cloud_env_groups',
          'user_id',
          'users',
          'cloud_env_groups_user_id_users_id_fk',
          'CASCADE'
        ),
        (
          'cloud_env_vars',
          'user_id',
          'users',
          'cloud_env_vars_user_id_users_id_fk',
          'CASCADE'
        ),
        (
          'cloud_env_vars',
          'group_id',
          'cloud_env_groups',
          'cloud_env_vars_group_id_cloud_env_groups_id_fk',
          'SET NULL'
        ),
        (
          'cloud_activities',
          'user_id',
          'users',
          'cloud_activities_user_id_users_id_fk',
          'CASCADE'
        )
    ) AS relationships(
      source_table,
      source_column,
      target_table,
      constraint_name,
      delete_action
    )
  LOOP
    IF to_regclass(format('public.%I', relationship.source_table)) IS NOT NULL
      AND to_regclass(format('public.%I', relationship.target_table)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_record
        WHERE constraint_record.contype = 'f'
          AND constraint_record.conrelid = to_regclass(
            format('public.%I', relationship.source_table)
          )
          AND constraint_record.confrelid = to_regclass(
            format('public.%I', relationship.target_table)
          )
          AND constraint_record.conkey = ARRAY[
            (
              SELECT attribute.attnum
              FROM pg_attribute attribute
              WHERE attribute.attrelid = to_regclass(
                format('public.%I', relationship.source_table)
              )
                AND attribute.attname = relationship.source_column
            )
          ]::smallint[]
      )
    THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s NOT VALID',
        relationship.source_table,
        relationship.constraint_name,
        relationship.source_column,
        relationship.target_table,
        relationship.delete_action
      );

      EXECUTE format(
        'ALTER TABLE %I VALIDATE CONSTRAINT %I',
        relationship.source_table,
        relationship.constraint_name
      );
    END IF;
  END LOOP;
END $$;
