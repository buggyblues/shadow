import { describe, expect, it } from 'vitest'
import {
  applySafeDeploymentPreferences,
  configuredWorkloadBackendPreference,
} from '../src/lib/cloud-saas-deployment-preferences'

describe('cloud-saas deployment preferences', () => {
  it('defaults to deployment when no sandbox-capable cluster is configured', () => {
    expect(configuredWorkloadBackendPreference({})).toBe('deployment')
  })

  it('uses agent-sandbox when cluster.json advertises sandbox and backend is auto', () => {
    const snapshot = applySafeDeploymentPreferences(
      { deployments: { namespace: 'demo', agents: [] } },
      undefined,
      {
        CLOUD_SAAS_WORKLOAD_BACKEND: 'auto',
        CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED: 'true',
        CLOUD_SAAS_SANDBOX_RUNTIME_CLASS: 'shadow-runc',
        CLOUD_SAAS_SANDBOX_NODE_SELECTOR: '{"shadowob.com/sandbox-ready":"true"}',
      },
    )

    expect(snapshot.deployments).toMatchObject({
      backend: 'agent-sandbox',
      backendPolicy: 'sandbox-preferred',
      sandbox: { runtimeClassName: 'shadow-runc' },
      scheduling: { nodeSelector: { 'shadowob.com/sandbox-ready': 'true' } },
    })
  })

  it('lets an explicit deployment fallback override client sandbox preference', () => {
    const snapshot = applySafeDeploymentPreferences(
      { deployments: { namespace: 'demo', agents: [] } },
      { deployments: { backend: 'agent-sandbox' } },
      {
        CLOUD_SAAS_WORKLOAD_BACKEND: 'deployment',
        CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED: 'true',
      },
    )

    expect(snapshot.deployments).toMatchObject({ backend: 'deployment' })
  })
})
