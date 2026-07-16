import type { IncomingMessage } from 'node:http'
import { connect as connectTcp } from 'node:net'
import type { Duplex } from 'node:stream'
import { type RawData, WebSocket, WebSocketServer } from 'ws'
import type { AppContainer } from '../container'
import { verifyCloudComputerBrowserSession } from '../lib/cloud-computer-browser-session'
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

function parseCloudComputerUpgrade(request: IncomingMessage) {
  const host = request.headers.host ?? 'localhost'
  const url = new URL(request.url ?? '/', `http://${host}`)
  const match = url.pathname.match(/^\/api\/cloud-computers\/([^/]+)\/(desktop|browser)\/ws$/)
  if (!match?.[1] || (match[2] !== 'desktop' && match[2] !== 'browser')) return null
  return {
    computerId: decodeURIComponent(match[1]),
    kind: match[2],
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
      service: 'cloud-computer-remote-surface',
      capabilities: [],
    }),
    clusterId: deployment.clusterId,
  })
  return cluster?.kubeconfigEncrypted ? decrypt(cluster.kubeconfigEncrypted) : undefined
}

async function openBrowserUpstream(localPort: number) {
  const response = await fetch(`http://127.0.0.1:${localPort}/json/list`, {
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`Browser CDP discovery failed (${response.status})`)
  const pages = (await response.json()) as Array<{
    type?: string
    webSocketDebuggerUrl?: string
  }>
  const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl) ?? pages[0]
  if (!page?.webSocketDebuggerUrl) throw new Error('Browser CDP page is unavailable')

  const upstreamUrl = new URL(page.webSocketDebuggerUrl)
  upstreamUrl.protocol = 'ws:'
  upstreamUrl.host = `127.0.0.1:${localPort}`
  const upstream = new WebSocket(upstreamUrl)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      upstream.terminate()
      reject(new Error('Browser CDP connection timed out'))
    }, 5_000)
    upstream.once('open', () => {
      clearTimeout(timer)
      resolve()
    })
    upstream.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
  return upstream
}

function sendWebSocketData(target: WebSocket, data: RawData, isBinary: boolean) {
  if (target.readyState === WebSocket.OPEN) target.send(data, { binary: isBinary })
}

function bridgeBrowserWebSockets(client: WebSocket, upstream: WebSocket, cleanupPort: () => void) {
  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    cleanupPort()
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
      client.close()
    }
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close()
    }
  }
  client.on('message', (data, isBinary) => sendWebSocketData(upstream, data, isBinary))
  upstream.on('message', (data, isBinary) => sendWebSocketData(client, data, isBinary))
  client.on('error', cleanup)
  client.on('close', cleanup)
  upstream.on('error', cleanup)
  upstream.on('close', cleanup)
}

export function setupCloudComputerRawGateway(
  server: UpgradeCapableServer,
  container: AppContainer,
) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const parsed = parseCloudComputerUpgrade(request)
    if (!parsed) return

    void (async () => {
      let portForward: { localPort: number; cleanup: () => void } | null = null
      try {
        const claims =
          parsed.kind === 'browser'
            ? verifyCloudComputerBrowserSession(parsed.token)
            : verifyCloudComputerDesktopSession(parsed.token)

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
          rejectUpgrade(socket, 401, `Invalid ${parsed.kind} session`)
          return
        }

        const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
        portForward = await container.resolve('kubernetesOpsGateway').portForwardService({
          namespace: claims.namespace,
          serviceName: claims.serviceName,
          targetPort: claims.targetPort,
          kubeconfig,
        })
        const activePortForward = portForward

        if (parsed.kind === 'browser') {
          const upstream = await openBrowserUpstream(activePortForward.localPort)
          wss.handleUpgrade(request, socket, head, (ws) => {
            bridgeBrowserWebSockets(ws, upstream, activePortForward.cleanup)
            portForward = null
          })
          return
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          const tcp = connectTcp({ host: '127.0.0.1', port: activePortForward.localPort })
          let closed = false
          const cleanup = () => {
            if (closed) return
            closed = true
            activePortForward.cleanup()
            portForward = null
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
        portForward?.cleanup()
        logger.warn({ err, kind: parsed.kind }, 'Cloud computer WebSocket upgrade failed')
        const status = (err as { status?: number }).status ?? 502
        rejectUpgrade(
          socket,
          status,
          status === 401 ? `Invalid ${parsed.kind} session` : 'Cloud computer gateway unavailable',
        )
      }
    })()
  })

  return wss
}
