import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cloudExposureHostFromLocalGatewayHost,
  cloudExposureHostFromRequestHost,
  isCloudExposureHost,
} from '../src/lib/cloud-exposure-gateway'

describe('cloud exposure gateway host helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('recognizes production exposure hosts without rewriting the host', () => {
    vi.stubEnv('SHADOWOB_CLOUD_EXPOSURE_DOMAIN', 'shadowob.com')

    expect(isCloudExposureHost('app-counter-9b347b846f.shadowob.com')).toBe(true)
    expect(cloudExposureHostFromRequestHost('app-counter-9b347b846f.shadowob.com')).toBe(
      'app-counter-9b347b846f.shadowob.com',
    )
    expect(cloudExposureHostFromRequestHost('app-counter-9b347b846f.shadowob.com:443')).toBe(
      'app-counter-9b347b846f.shadowob.com',
    )
    expect(isCloudExposureHost('exp-dev-agent-preview-9b347b846f.shadowob.com')).toBe(true)
    expect(cloudExposureHostFromRequestHost('exp-dev-agent-preview-9b347b846f.shadowob.com')).toBe(
      null,
    )
    expect(cloudExposureHostFromRequestHost('shadowob.com')).toBeNull()
  })

  it('keeps local gateway host support for development URLs', () => {
    vi.stubEnv('SHADOWOB_CLOUD_EXPOSURE_DOMAIN', 'shadowob.com')
    vi.stubEnv('SHADOWOB_CLOUD_EXPOSURE_LOCAL_GATEWAY_SUFFIX', 'localhost')

    expect(
      cloudExposureHostFromLocalGatewayHost('app-counter-9b347b846f.shadowob.com.localhost:3002'),
    ).toBe('app-counter-9b347b846f.shadowob.com')
    expect(
      cloudExposureHostFromRequestHost('app-counter-9b347b846f.shadowob.com.localhost:3002'),
    ).toBe('app-counter-9b347b846f.shadowob.com')
  })
})
