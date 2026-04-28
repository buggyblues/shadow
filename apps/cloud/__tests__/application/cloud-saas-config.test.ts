import { describe, expect, it } from 'vitest'
import {
  attachCloudSaasProvisionState,
  extractCloudSaasRuntime,
  resolveCloudSaasShadowRuntime,
  sanitizeCloudSaasDeployment,
} from '../../src/application/cloud-saas-config'

describe('resolveCloudSaasShadowRuntime', () => {
  it('prefers SHADOW_AGENT_SERVER_URL for pod-facing runtime while keeping provisioning URL separate', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOW_SERVER_URL: 'http://server:3002',
        SHADOW_USER_TOKEN: 'pat_test',
      },
      {
        SHADOW_SERVER_URL: 'http://server:3002',
        SHADOW_AGENT_SERVER_URL: 'http://host.lima.internal:3002',
        SHADOW_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://server:3002',
      podShadowUrl: 'http://host.lima.internal:3002',
      shadowToken: 'pat_test',
    })
  })

  it('normalizes loopback SHADOW_SERVER_URL to the worker-facing runtime URL', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOW_SERVER_URL: 'http://localhost:3002',
        SHADOW_USER_TOKEN: 'pat_test',
      },
      {
        SHADOW_SERVER_URL: 'http://server:3002',
        SHADOW_AGENT_SERVER_URL: 'http://host.lima.internal:3002',
        SHADOW_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://server:3002',
      podShadowUrl: 'http://host.lima.internal:3002',
      shadowToken: 'pat_test',
    })
  })

  it('prefers an explicit SHADOW_PROVISION_URL when provided', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOW_SERVER_URL: 'http://localhost:3002',
        SHADOW_PROVISION_URL: 'http://server:3002',
        SHADOW_USER_TOKEN: 'pat_test',
      },
      {
        SHADOW_AGENT_SERVER_URL: 'http://host.lima.internal:3002',
        SHADOW_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://server:3002',
      podShadowUrl: 'http://host.lima.internal:3002',
      shadowToken: 'pat_test',
    })
  })

  it('persists provision state in hidden SaaS runtime metadata', () => {
    const provisionState = {
      provisionedAt: '2026-04-28T00:00:00.000Z',
      namespace: 'gstack-buddy',
      plugins: {
        shadowob: {
          buddies: {
            'strategy-buddy': {
              agentId: 'agent-1',
              userId: 'user-1',
              token: 'agent-token',
            },
          },
        },
      },
    }

    const snapshot = attachCloudSaasProvisionState(
      {
        version: '1',
        deployments: {
          agents: [{ id: 'strategy-buddy', runtime: 'openclaw' }],
        },
        __shadowobRuntime: {
          envVars: {
            SHADOW_USER_TOKEN: 'user-token',
          },
        },
      },
      provisionState,
    )

    const runtime = extractCloudSaasRuntime(snapshot)
    expect(runtime.provisionState?.plugins.shadowob).toEqual(provisionState.plugins.shadowob)
    expect(runtime.envVars.SHADOW_USER_TOKEN).toBe('user-token')

    const sanitized = sanitizeCloudSaasDeployment({ configSnapshot: snapshot })
    expect((sanitized.configSnapshot as Record<string, unknown>).__shadowobRuntime).toBeUndefined()
  })
})
