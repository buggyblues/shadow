-- Security architecture migration: idempotency guards for high-risk side effects.
-- Preserve historical rows where possible, then add database-level idempotency guards.

-- Existing duplicate wallet references are historical ledger rows. Detach duplicate
-- idempotency references instead of deleting financial history.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY wallet_id, type, reference_type, reference_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM wallet_transactions
  WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL
)
UPDATE wallet_transactions AS wt
SET
  reference_id = NULL,
  reference_type = NULL,
  note = CONCAT_WS(' ', wt.note, '[migration: duplicate idempotency reference detached]')
FROM ranked
WHERE wt.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallet_transactions_reference_unique'
  ) THEN
    ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "wallet_transactions_reference_unique"
      UNIQUE ("wallet_id", "type", "reference_type", "reference_id");
  END IF;
END $$;
--> statement-breakpoint

-- Existing duplicate violation rows are redundant state-machine events. Keep the
-- earliest row per contract/type/violator before enforcing the invariant.
DELETE FROM rental_violations
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY contract_id, violation_type, violator_id
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM rental_violations
  ) AS ranked
  WHERE rn > 1
);
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rental_violations_contract_type_violator_unique'
  ) THEN
    ALTER TABLE "rental_violations"
      ADD CONSTRAINT "rental_violations_contract_type_violator_unique"
      UNIQUE ("contract_id", "violation_type", "violator_id");
  END IF;
END $$;
--> statement-breakpoint

-- Retire duplicate active platform namespaces without deleting deployment history.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY namespace
      ORDER BY
        CASE WHEN status IN ('deployed', 'deploying', 'pending') THEN 1 ELSE 2 END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM cloud_deployments
  WHERE cluster_id IS NULL
    AND status <> 'failed'
    AND status <> 'destroyed'
)
UPDATE cloud_deployments AS cd
SET
  status = 'failed',
  error_message = COALESCE(cd.error_message, 'Duplicate active namespace retired by migration 0066'),
  updated_at = now()
FROM ranked
WHERE cd.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS cloud_deployments_platform_namespace_unique
  ON cloud_deployments (namespace)
  WHERE cluster_id IS NULL
    AND status <> 'failed'
    AND status <> 'destroyed';
--> statement-breakpoint

-- Retire duplicate active cluster namespaces without deleting deployment history.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY cluster_id, namespace
      ORDER BY
        CASE WHEN status IN ('deployed', 'deploying', 'pending') THEN 1 ELSE 2 END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM cloud_deployments
  WHERE cluster_id IS NOT NULL
    AND status <> 'failed'
    AND status <> 'destroyed'
)
UPDATE cloud_deployments AS cd
SET
  status = 'failed',
  error_message = COALESCE(cd.error_message, 'Duplicate active namespace retired by migration 0066'),
  updated_at = now()
FROM ranked
WHERE cd.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS cloud_deployments_cluster_namespace_unique
  ON cloud_deployments (cluster_id, namespace)
  WHERE cluster_id IS NOT NULL
    AND status <> 'failed'
    AND status <> 'destroyed';
