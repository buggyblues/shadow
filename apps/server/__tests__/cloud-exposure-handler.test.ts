import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET ??= 'cloud-exposure-handler-test-secret'

const { createCloudExposureHandler } = await import('../src/handlers/cloud-exposure.handler')
const { signAccessToken, signCloudExposureToken } = await import('../src/lib/jwt')

describe('Cloud exposure handler', () => {
  it('accepts sidecar reconcile tokens without ordinary user auth', async () => {
    const deploymentId = '00000000-0000-0000-0000-000000000001'
    const agentId = 'app-buddy'
    const reconcileRuntimeExposures = vi.fn(async (_input, auth) => ({
      accepted: [],
      denied: [],
      closed: [],
      deploymentId,
      agentId,
      status: { path: '/run/shadow/exposure/status.json' },
      sidecarAgentId: auth.sidecar?.agentId,
    }))
    const app = new Hono()
    app.route(
      '/api/cloud/exposures',
      createCloudExposureHandler({
        resolve(name: string) {
          if (name === 'cloudExposureService') return { reconcileRuntimeExposures }
          throw new Error(`Unexpected dependency: ${name}`)
        },
      } as never),
    )
    const token = signCloudExposureToken({
      deploymentId,
      namespace: 'app-buddy',
      userId: 'user-1',
      agentId,
      scopes: ['cloud:exposure:reconcile'],
    })

    const response = await app.request('/api/cloud/exposures/runtime/reconcile', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deploymentId, agentId, exposures: [] }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        sidecarAgentId: agentId,
      }),
    )
    expect(reconcileRuntimeExposures).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: undefined,
        sidecar: expect.objectContaining({ agentId }),
      }),
    )
  })

  it('publishes through only the canonical space-app route', async () => {
    const deploymentId = '00000000-0000-0000-0000-000000000001'
    const publishApp = vi.fn().mockResolvedValue({ appKey: 'travel', status: 'published' })
    const app = new Hono()
    app.route(
      '/api/cloud/exposures',
      createCloudExposureHandler({
        resolve(name: string) {
          if (name === 'cloudExposureService') return { publishApp }
          throw new Error(`Unexpected dependency: ${name}`)
        },
      } as never),
    )
    const requestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signAccessToken({ userId: 'user-1' })}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deploymentId,
        agentId: 'agent-1',
        serverId: 'server-1',
        port: 4224,
        appKey: 'travel',
      }),
    }

    const response = await app.request('/api/cloud/exposures/space-apps/publish', requestInit)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ appKey: 'travel', status: 'published' })
    expect(publishApp).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
      expect.objectContaining({ deploymentId, appKey: 'travel' }),
    )
  })
})
