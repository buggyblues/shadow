import type { IncomingMessage } from 'node:http'
import { connect as connectTcp } from 'node:net'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { AppContainer } from '../container'
import { verifyCloudComputerDesktopSession } from '../lib/cloud-computer-desktop-session'
import { cloudComputerIdForDeployment } from '../lib/cloud-computer-identity'
import { decrypt } from '../lib/kms'
import { logger } from '../lib/logger'
import { createActorContext } from '../security/actor-context'

type UpgradeCapableServer = {
  on(
    event: 'upgrade',
    listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void,
  ): unknown
}

function rejectUpgrade(socket: Duplex, status: number, message: string) {
  try {
    socket.write(
      `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${message.length}\r\n\r\n${message}`,
    )
  } finally {
    socket.destroy()
  }
}

function parseVncUpgrade(request: IncomingMessage) {
  const host = request.headers.host ?? 'localhost'
  const url = new URL(request.url ?? '/', `http://${host}`)
  const match = url.pathname.match(/^\/api\/cloud-computers\/([^/]+)\/desktop\/ws$/)
  if (!match?.[1]) return null
  return {
    computerId: decodeURIComponent(match[1]),
    token: url.searchParams.get('token') ?? '',
  }
}

async function resolveDeploymentKubeconfig(
  container: AppContainer,
  deployment: { clusterId: string | null },
) {
  if (!deployment.clusterId) return undefined
  const useCase = container.resolve('cloudSaasUseCase')
  const cluster = await useCase.findClusterByIdOnly({
    ctx: createActorContext({
      kind: 'system',
      service: 'cloud-computer-desktop',
      capabilities: [],
    }),
    clusterId: deployment.clusterId,
  })
  return cluster?.kubeconfigEncrypted ? decrypt(cluster.kubeconfigEncrypted) : undefined
}

export function setupCloudComputerRawGateway(
  server: UpgradeCapableServer,
  container: AppContainer,
) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const parsed = parseVncUpgrade(request)
    if (!parsed) return

    void (async () => {
      try {
        const claims = verifyCloudComputerDesktopSession(parsed.token)

        const useCase = container.resolve('cloudSaasUseCase')
        const deployment = await useCase.getDeploymentOwned({
          ctx: createActorContext({
            kind: 'user',
            userId: claims.userId,
            authMethod: 'jwt',
            scopes: [],
          }),
          deploymentId: claims.deploymentId,
        })
        if (!deployment || deployment.namespace !== claims.namespace) {
          rejectUpgrade(socket, 404, 'Cloud computer not found')
          return
        }
        const expectedCloudComputerId = cloudComputerIdForDeployment(deployment)
        if (
          parsed.computerId !== expectedCloudComputerId &&
          parsed.computerId !== claims.deploymentId
        ) {
          rejectUpgrade(socket, 401, 'Invalid desktop session')
          return
        }

        const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
        const portForward = await container.resolve('kubernetesOpsGateway').portForwardService({
          namespace: claims.namespace,
          serviceName: claims.serviceName,
          targetPort: claims.targetPort,
          kubeconfig,
        })

        wss.handleUpgrade(request, socket, head, (ws) => {
          const tcp = connectTcp({ host: '127.0.0.1', port: portForward.localPort })
          let closed = false
          const cleanup = () => {
            if (closed) return
            closed = true
            portForward.cleanup()
            tcp.destroy()
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
              ws.close()
            }
          }

          tcp.on('data', (chunk) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk)
          })
          tcp.on('error', cleanup)
          tcp.on('close', cleanup)
          ws.on('message', (data) => {
            if (Buffer.isBuffer(data)) {
              tcp.write(data)
            } else if (Array.isArray(data)) {
              tcp.write(Buffer.concat(data))
            } else {
              tcp.write(Buffer.from(data))
            }
          })
          ws.on('error', cleanup)
          ws.on('close', cleanup)
        })
      } catch (err) {
        logger.warn({ err }, 'Cloud computer VNC WebSocket upgrade failed')
        rejectUpgrade(socket, 502, 'Cloud computer gateway unavailable')
      }
    })()
  })

  return wss
}
