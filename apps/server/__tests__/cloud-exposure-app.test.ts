import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'

describe('cloud exposure app routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('proxies direct stable exposure hosts through the cloud exposure gateway', async () => {
    vi.stubEnv('SHADOWOB_CLOUD_EXPOSURE_DOMAIN', 'shadowob.com')
    const gatewayProxy = vi.fn(async () => new Response('proxied app', { status: 200 }))
    const app = createApp({
      resolve(name: string) {
        if (name === 'cloudExposureService') return { gatewayProxy }
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as never)

    const response = await app.request('http://app-counter-9b347b846f.shadowob.com/shadow/server', {
      headers: { Host: 'app-counter-9b347b846f.shadowob.com' },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('proxied app')
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(gatewayProxy).toHaveBeenCalledWith(
      'app-counter-9b347b846f.shadowob.com',
      expect.any(Request),
      '/shadow/server',
    )
  })
})
