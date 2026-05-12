UPDATE "cloud_deployment_backups"
SET "phase" = 'completed'
WHERE "status" = 'succeeded'
  AND "phase" = 'queued';

UPDATE "cloud_deployment_backups"
SET "phase" = 'failed'
WHERE "status" = 'failed'
  AND "phase" = 'queued';
