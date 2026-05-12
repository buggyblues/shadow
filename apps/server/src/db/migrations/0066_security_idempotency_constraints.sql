-- Security architecture migration: idempotency guards for high-risk side effects.
-- Run after removing or reconciling duplicate historical rows.

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_reference_unique
  ON wallet_transactions (wallet_id, type, reference_type, reference_id)
  WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rental_violations_contract_type_violator_unique
  ON rental_violations (contract_id, violation_type, violator_id);

CREATE UNIQUE INDEX IF NOT EXISTS cloud_deployments_platform_namespace_unique
  ON cloud_deployments (namespace)
  WHERE cluster_id IS NULL AND status IN ('pending', 'deploying', 'deployed', 'paused', 'resuming', 'destroying', 'cancelling');

CREATE UNIQUE INDEX IF NOT EXISTS cloud_deployments_cluster_namespace_unique
  ON cloud_deployments (cluster_id, namespace)
  WHERE cluster_id IS NOT NULL AND status IN ('pending', 'deploying', 'deployed', 'paused', 'resuming', 'destroying', 'cancelling');
