import { resolveCloudSaasShadowRuntime } from '@shadowob/cloud'
import { describe, expect, it } from 'vitest'

describe('resolveCloudSaasShadowRuntime', () => {
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
})
