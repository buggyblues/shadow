import { describe, expect, it } from 'vitest'
import { resolveCloudSaasShadowRuntime } from '../../src/application/cloud-saas-config'

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
})
