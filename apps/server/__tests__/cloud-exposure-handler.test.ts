import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createCloudExposureHandler } from '../src/handlers/cloud-exposure.handler'
import { signCloudExposureToken } from '../src/lib/jwt'

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
})
