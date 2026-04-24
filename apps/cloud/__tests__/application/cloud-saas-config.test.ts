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
})
