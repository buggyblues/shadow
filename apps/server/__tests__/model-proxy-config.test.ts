import { afterEach, describe, expect, it } from 'vitest'
import { resolveOfficialModelProxyRuntimeServerUrl } from '../src/lib/model-proxy-config'

const originalRuntimeUrl = process.env.SHADOWOB_MODEL_PROXY_RUNTIME_SERVER_URL

afterEach(() => {
  if (originalRuntimeUrl === undefined) {
    delete process.env.SHADOWOB_MODEL_PROXY_RUNTIME_SERVER_URL
  } else {
    process.env.SHADOWOB_MODEL_PROXY_RUNTIME_SERVER_URL = originalRuntimeUrl
  }
})

describe('official model proxy runtime URL', () => {
  it('keeps inferred host bridge URLs unavailable', () => {
    delete process.env.SHADOWOB_MODEL_PROXY_RUNTIME_SERVER_URL

    expect(
      resolveOfficialModelProxyRuntimeServerUrl({
        shadowServerUrl: 'http://host.docker.internal:3002',
      }),
    ).toMatchObject({
      runtimeServerUrl: undefined,
      runtimeServerUrlRequirement: expect.stringContaining('internal-only'),
    })
  })

  it('accepts an explicitly configured pod-reachable internal URL', () => {
    process.env.SHADOWOB_MODEL_PROXY_RUNTIME_SERVER_URL = 'http://host.docker.internal:3002/'

    expect(
      resolveOfficialModelProxyRuntimeServerUrl({
        shadowServerUrl: 'http://host.docker.internal:3002',
      }),
    ).toEqual({
      runtimeServerUrl: 'http://host.docker.internal:3002',
      runtimeServerUrlRequirement: 'SHADOWOB_MODEL_PROXY_RUNTIME_SERVER_URL',
    })
  })

  it('rejects an explicit loopback URL because it resolves inside the Buddy pod', () => {
    process.env.SHADOWOB_MODEL_PROXY_RUNTIME_SERVER_URL = 'http://127.0.0.1:3002'

    expect(resolveOfficialModelProxyRuntimeServerUrl({})).toMatchObject({
      runtimeServerUrl: undefined,
      runtimeServerUrlRequirement: expect.stringContaining('not loopback'),
    })
  })
})
