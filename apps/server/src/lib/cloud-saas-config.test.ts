import { describe, expect, it } from 'vitest'
import {
  CLOUD_SAAS_RUNTIME_KEY,
  extractCloudSaasRuntime,
  prepareCloudSaasConfigSnapshot,
  redactCloudSaasConfigSnapshot,
  resolveCloudSaasShadowRuntime,
  validateCloudSaasConfigSnapshot,
} from './cloud-saas-config'

const validSnapshot = {
  version: '1.0.0',
  deployments: {
    namespace: 'shadowob-cloud',
    agents: [
      {
        id: 'rental-manager',
        runtime: 'openclaw',
        configuration: {
          openclaw: {},
        },
      },
    ],
  },
}

describe('cloud-saas-config', () => {
  it('rejects invalid config snapshots before billing', () => {
    expect(() => validateCloudSaasConfigSnapshot({ SHADOW_USER_TOKEN: 'pat_xxx' })).toThrow(
      /Invalid configSnapshot/,
    )
  })

  it('stores runtime env vars separately and strips them back out for the worker', () => {
    const prepared = prepareCloudSaasConfigSnapshot(validSnapshot, {
      SHADOW_SERVER_URL: 'http://server:3002',
      SHADOW_USER_TOKEN: 'pat_test',
      EMPTY: '   ',
      SAVED: '__SAVED__',
    })

    expect(prepared).toHaveProperty(CLOUD_SAAS_RUNTIME_KEY)

    const extracted = extractCloudSaasRuntime(prepared)

    expect(extracted.configSnapshot).toEqual(validSnapshot)
    expect(extracted.envVars).toEqual({
      SHADOW_SERVER_URL: 'http://server:3002',
      SHADOW_USER_TOKEN: 'pat_test',
    })
  })

  it('redacts literal secrets and hides runtime metadata from API responses', () => {
    const prepared = prepareCloudSaasConfigSnapshot(
      {
        ...validSnapshot,
        plugins: {
          shadowob: {
            secrets: {
              SHADOW_USER_TOKEN: 'pat_test',
            },
          },
        },
        registry: {
          vaults: {
            default: {
              providers: {
                anthropic: {
                  apiKey: 'sk-ant-secret',
                },
              },
            },
          },
        },
      },
      {
        SHADOW_SERVER_URL: 'http://server:3002',
      },
    )

    const redacted = redactCloudSaasConfigSnapshot(prepared) as Record<string, unknown>

    expect(redacted).not.toHaveProperty(CLOUD_SAAS_RUNTIME_KEY)
    expect(redacted).toMatchObject({
      plugins: {
        shadowob: {
          secrets: {
            SHADOW_USER_TOKEN: '[REDACTED]',
          },
        },
      },
      registry: {
        vaults: {
          default: {
            providers: {
              anthropic: {
                apiKey: '[REDACTED]',
              },
            },
          },
        },
      },
    })
  })

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
})
