import { describe, expect, it } from 'vitest'
import { resolveCloudSaasShadowRuntime } from '../../cloud/src/application/cloud-saas-config'

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

  it('uses SHADOWOB_AGENT_SERVER_URL for pod-facing runtime while provisioning stays internal', () => {
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

  it('separates host-local provisioning from the pod-facing development URL', () => {
    expect(
      resolveCloudSaasShadowRuntime(
        { SHADOWOB_SERVER_URL: 'http://127.0.0.1:3002' },
        { SHADOWOB_AGENT_SERVER_URL: 'http://host.docker.internal:3002' },
      ),
    ).toMatchObject({
      shadowUrl: 'http://127.0.0.1:3002',
      podShadowUrl: 'http://host.docker.internal:3002',
    })
  })

  it('does not use a Docker-only pod hostname for host-side provisioning', () => {
    expect(
      resolveCloudSaasShadowRuntime(
        { SHADOWOB_SERVER_URL: 'http://host.docker.internal:3002' },
        {
          SHADOWOB_SERVER_URL: 'http://127.0.0.1:3002',
          SHADOWOB_AGENT_SERVER_URL: 'http://host.docker.internal:3002',
        },
      ),
    ).toMatchObject({
      shadowUrl: 'http://127.0.0.1:3002',
      podShadowUrl: 'http://host.docker.internal:3002',
    })
  })
})
