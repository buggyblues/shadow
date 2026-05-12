-- Security architecture migration: idempotency guards for high-risk side effects.
-- Removes duplicate historical rows before creating unique constraints.

-- Clean duplicate wallet_transactions (keep earliest per reference)
DELETE FROM wallet_transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY wallet_id, type, reference_type, reference_id
      ORDER BY created_at ASC
    ) AS rn
    FROM wallet_transactions
    WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL
  ) AS ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_reference_unique
  ON wallet_transactions (wallet_id, type, reference_type, reference_id)
  WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL;

-- Clean duplicate rental_violations (keep earliest)
DELETE FROM rental_violations
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY contract_id, violation_type, violator_id
      ORDER BY created_at ASC
    ) AS rn
    FROM rental_violations
  ) AS ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS rental_violations_contract_type_violator_unique
  ON rental_violations (contract_id, violation_type, violator_id);

-- Clean duplicate cloud_deployments by namespace (keep active, prefer earliest)
DELETE FROM cloud_deployments
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY namespace
      ORDER BY
        CASE WHEN status IN ('deployed','deploying','pending') THEN 1 ELSE 2 END,
        created_at ASC
    ) AS rn
    FROM cloud_deployments
    WHERE cluster_id IS NULL AND status IN ('pending', 'deploying', 'deployed', 'paused', 'resuming', 'destroying', 'cancelling')
  ) AS ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS cloud_deployments_platform_namespace_unique
  ON cloud_deployments (namespace)
  WHERE cluster_id IS NULL AND status IN ('pending', 'deploying', 'deployed', 'paused', 'resuming', 'destroying', 'cancelling');

-- Clean duplicate cloud_deployments by cluster+namespace
DELETE FROM cloud_deployments
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY cluster_id, namespace
      ORDER BY
        CASE WHEN status IN ('deployed','deploying','pending') THEN 1 ELSE 2 END,
        created_at ASC
    ) AS rn
    FROM cloud_deployments
    WHERE cluster_id IS NOT NULL AND status IN ('pending', 'deploying', 'deployed', 'paused', 'resuming', 'destroying', 'cancelling')
  ) AS ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS cloud_deployments_cluster_namespace_unique
  ON cloud_deployments (cluster_id, namespace)
  WHERE cluster_id IS NOT NULL AND status IN ('pending', 'deploying', 'deployed', 'paused', 'resuming', 'destroying', 'cancelling');
