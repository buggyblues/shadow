import { describe, expect, it } from 'vitest'
import {
  attachCloudSaasProvisionState,
  extractCloudSaasRuntime,
  prepareCloudSaasConfigSnapshot,
  resolveCloudSaasShadowRuntime,
  sanitizeCloudSaasDeployment,
} from '../../src/application/cloud-saas-config'

describe('resolveCloudSaasShadowRuntime', () => {
  it('prefers SHADOWOB_SERVER_URL for pod-facing runtime while keeping provisioning URL separate', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOWOB_SERVER_URL: 'http://host.lima.internal:3002',
        SHADOWOB_PROVISION_URL: 'http://server:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
      {
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://server:3002',
      podShadowUrl: 'http://host.lima.internal:3002',
      shadowToken: 'pat_test',
    })
  })

  it('uses SHADOWOB_AGENT_SERVER_URL as the process-level pod-facing default', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
      {
        SHADOWOB_AGENT_SERVER_URL: 'https://shadowob.com',
        SHADOWOB_SERVER_URL: 'http://server:3002',
        SHADOWOB_PROVISION_URL: 'http://server:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://server:3002',
      podShadowUrl: 'https://shadowob.com',
      shadowToken: 'pat_test',
    })
  })

  it('normalizes loopback SHADOWOB_SERVER_URL to the worker-facing runtime URL', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOWOB_SERVER_URL: 'http://localhost:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
      {
        SHADOWOB_SERVER_URL: 'http://server:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://server:3002',
      podShadowUrl: 'http://server:3002',
      shadowToken: 'pat_test',
    })
  })

  it('prefers an explicit SHADOWOB_PROVISION_URL when provided', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOWOB_SERVER_URL: 'http://localhost:3002',
        SHADOWOB_PROVISION_URL: 'http://server:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
      {
        SHADOWOB_SERVER_URL: 'http://host.lima.internal:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://server:3002',
      podShadowUrl: 'http://host.lima.internal:3002',
      shadowToken: 'pat_test',
    })
  })

  it('keeps loopback provisioning local while giving pods a container-reachable URL', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOWOB_SERVER_URL: 'http://127.0.0.1:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
      {
        SHADOWOB_AGENT_SERVER_URL: 'http://host.docker.internal:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://127.0.0.1:3002',
      podShadowUrl: 'http://host.docker.internal:3002',
      shadowToken: 'pat_test',
    })
  })

  it('keeps host-side provisioning local when the persisted pod URL uses a Docker alias', () => {
    const resolved = resolveCloudSaasShadowRuntime(
      {
        SHADOWOB_SERVER_URL: 'http://host.docker.internal:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
      {
        SHADOWOB_SERVER_URL: 'http://127.0.0.1:3002',
        SHADOWOB_AGENT_SERVER_URL: 'http://host.docker.internal:3002',
        SHADOWOB_USER_TOKEN: 'pat_test',
      },
    )

    expect(resolved).toEqual({
      shadowUrl: 'http://127.0.0.1:3002',
      podShadowUrl: 'http://host.docker.internal:3002',
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
            ANTHROPIC_API_KEY: 'runtime-key',
            SHADOWOB_PROVISION_URL: 'http://server:3002',
            SHADOWOB_USER_TOKEN: 'user-token',
          },
        },
      },
      provisionState,
    )

    const runtime = extractCloudSaasRuntime(snapshot)
    expect(runtime.provisionState?.plugins.shadowob).toEqual(provisionState.plugins.shadowob)
    expect(runtime.envVars.ANTHROPIC_API_KEY).toBe('runtime-key')
    expect(runtime.envVars.SHADOWOB_PROVISION_URL).toBeUndefined()
    expect(runtime.envVars.SHADOWOB_USER_TOKEN).toBeUndefined()

    const sanitized = sanitizeCloudSaasDeployment({ configSnapshot: snapshot })
    expect((sanitized.configSnapshot as Record<string, unknown>).__shadowobRuntime).toBeUndefined()
  })

  it('persists the non-secret Shadow endpoint but not backend-only credentials or overrides', () => {
    const snapshot = prepareCloudSaasConfigSnapshot(
      {
        version: '1',
        deployments: {
          agents: [{ id: 'strategy-buddy', runtime: 'openclaw' }],
        },
      },
      {
        SHADOWOB_AGENT_SERVER_URL: 'http://agent.test:3002',
        ANTHROPIC_API_KEY: 'runtime-key',
        SHADOWOB_PROVISION_URL: 'http://server:3002',
        SHADOWOB_SERVER_URL: 'http://agent.test:3002',
        SHADOWOB_USER_TOKEN: 'user-token',
      },
    )

    const runtime = extractCloudSaasRuntime(snapshot)
    expect(runtime.envVars).toEqual({
      ANTHROPIC_API_KEY: 'runtime-key',
      SHADOWOB_SERVER_URL: 'http://agent.test:3002',
    })
  })

  it('persists deployment locale and timezone in hidden runtime metadata', () => {
    const snapshot = prepareCloudSaasConfigSnapshot(
      {
        version: '1',
        deployments: {
          agents: [{ id: 'strategy-buddy', runtime: 'openclaw' }],
        },
      },
      {},
      {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
      },
    )

    const runtime = extractCloudSaasRuntime(snapshot)
    expect(snapshot.locale).toBe('zh-CN')
    expect(runtime.context).toEqual({
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
    })
    expect((runtime.configSnapshot as Record<string, unknown>).__shadowobRuntime).toBeUndefined()
  })

  it('persists compiled runtime topology in hidden runtime metadata', () => {
    const snapshot = prepareCloudSaasConfigSnapshot({
      version: '1',
      deployments: {
        placement: {
          groups: [{ id: 'openclaw-main', agentIds: ['agent-a', 'agent-b'] }],
        },
        agents: [
          { id: 'agent-a', runtime: 'openclaw' },
          { id: 'agent-b', runtime: 'openclaw' },
        ],
      },
    })

    const runtime = extractCloudSaasRuntime(snapshot)
    expect(runtime.topology).toEqual({
      schemaVersion: 1,
      executionUnits: [
        expect.objectContaining({
          id: 'openclaw-main',
          runtimeKind: 'openclaw',
          packageMode: 'multi-agent',
          agentIds: ['agent-a', 'agent-b'],
          statePvcName: 'shadow-runner-state-openclaw-main',
        }),
      ],
      agentToExecutionUnit: {
        'agent-a': 'openclaw-main',
        'agent-b': 'openclaw-main',
      },
    })
    expect((runtime.configSnapshot as Record<string, unknown>).__shadowobRuntime).toBeUndefined()
  })
})
