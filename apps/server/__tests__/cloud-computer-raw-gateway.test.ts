import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { signCloudComputerBrowserSession } from '../src/lib/cloud-computer-browser-session'
import { cloudComputerIdForDeployment } from '../src/lib/cloud-computer-identity'
import { setupCloudComputerRawGateway } from '../src/ws/cloud-computer-raw.gateway'

describe('cloud computer raw browser gateway', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-browser-session-secret-that-is-long-enough'
  })

  afterEach(() => {
    delete process.env.JWT_SECRET
  })

  it('proxies a signed browser session to the page CDP WebSocket', async () => {
    const upstreamServer = createServer((request, response) => {
      if (request.url !== '/json/list') {
        response.writeHead(404).end()
        return
      }
      const port = (upstreamServer.address() as AddressInfo).port
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify([
          {
            id: 'page-1',
            type: 'page',
            webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/page-1`,
          },
        ]),
      )
    })
    const upstreamWss = new WebSocketServer({ noServer: true })
    upstreamServer.on('upgrade', (request, socket, head) => {
      if (request.url !== '/devtools/page/page-1') {
        socket.destroy()
        return
      }
      upstreamWss.handleUpgrade(request, socket, head, (ws) => {
        ws.on('message', (data) => {
          const command = JSON.parse(String(data)) as { id: number; method: string }
          ws.send(JSON.stringify({ id: command.id, result: { proxiedMethod: command.method } }))
        })
      })
    })
    upstreamServer.listen(0, '127.0.0.1')
    await once(upstreamServer, 'listening')

    const deployment = {
      id: 'deployment-browser-1',
      userId: 'user-1',
      namespace: 'cloud-browser-test',
      clusterId: null,
    }
    const cleanupPortForward = vi.fn()
    const portForwardService = vi.fn(async () => ({
      localPort: (upstreamServer.address() as AddressInfo).port,
      cleanup: cleanupPortForward,
    }))
    const getDeploymentOwned = vi.fn(async () => deployment)
    const container = {
      resolve(name: string) {
        if (name === 'cloudSaasUseCase') return { getDeploymentOwned }
        if (name === 'kubernetesOpsGateway') return { portForwardService }
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }

    const gatewayServer = createServer()
    const gatewayWss = setupCloudComputerRawGateway(gatewayServer, container as never)
    gatewayServer.listen(0, '127.0.0.1')
    await once(gatewayServer, 'listening')

    const signed = signCloudComputerBrowserSession({
      deploymentId: deployment.id,
      userId: deployment.userId,
      namespace: deployment.namespace,
      serviceName: 'cloud-computer-browser',
      targetPort: 9222,
    })
    const computerId = cloudComputerIdForDeployment(deployment)
    const gatewayPort = (gatewayServer.address() as AddressInfo).port
    const client = new WebSocket(
      `ws://127.0.0.1:${gatewayPort}/api/cloud-computers/${computerId}/browser/ws?token=${encodeURIComponent(signed.token)}`,
    )

    try {
      await once(client, 'open')
      client.send(JSON.stringify({ id: 42, method: 'Page.startScreencast', params: {} }))
      const [message] = (await once(client, 'message')) as [Buffer]
      expect(JSON.parse(message.toString())).toEqual({
        id: 42,
        result: { proxiedMethod: 'Page.startScreencast' },
      })
      expect(portForwardService).toHaveBeenCalledWith({
        namespace: deployment.namespace,
        serviceName: 'cloud-computer-browser',
        targetPort: 9222,
        kubeconfig: undefined,
      })
    } finally {
      client.close()
      await once(client, 'close').catch(() => undefined)
      await vi.waitFor(() => expect(cleanupPortForward).toHaveBeenCalledOnce())
      gatewayWss.close()
      gatewayServer.close()
      upstreamWss.close()
      upstreamServer.close()
    }
  })
})
