import { randomUUID } from 'node:crypto'
import type { Socket, Server as SocketIOServer } from 'socket.io'
import { z } from 'zod'
import type { AppContainer } from '../container'
import type { KubernetesInteractiveTerminalSession } from '../gateways/kubernetes-ops.gateway'
import { resolveCloudComputerDeployment } from '../lib/cloud-computer-identity'
import { resolveRuntimeStateTarget } from '../lib/cloud-runtime-state'
import { decrypt } from '../lib/kms'
import { logger } from '../lib/logger'
import type { Actor } from '../security/actor'
import { createActorContext } from '../security/actor-context'

const terminalStartSchema = z.object({
  computerId: z.string().min(1).max(255),
  pod: z.string().min(1).max(253).optional(),
  agent: z.string().min(1).max(128).optional(),
  container: z.string().min(1).max(253).optional(),
  shell: z.enum(['/bin/sh', '/bin/bash', '/usr/bin/bash', '/usr/bin/zsh']).optional(),
  cols: z.number().int().min(20).max(240).optional(),
  rows: z.number().int().min(8).max(80).optional(),
})

const terminalInputSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string().max(64 * 1024),
})

const terminalResizeSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(20).max(240),
  rows: z.number().int().min(8).max(80),
})

const terminalStopSchema = z.object({
  sessionId: z.string().min(1),
})

type TerminalStartAck =
  | {
      ok: true
      sessionId: string
      namespace: string
      pod: string
      container?: string
    }
  | { ok: false; error: string; code?: string }

type TerminalSessionEntry = {
  terminal: KubernetesInteractiveTerminalSession
  computerId: string
  pod: string
  container?: string
}

function socketActor(socket: Socket): Actor | null {
  const actor = socket.data.actor as Actor | undefined
  return actor ?? null
}

async function resolveDeploymentKubeconfig(
  container: AppContainer,
  deployment: { clusterId: string | null },
): Promise<string | undefined> {
  if (!deployment.clusterId) return undefined
  const useCase = container.resolve('cloudSaasUseCase')
  const cluster = await useCase.findClusterByIdOnly({
    ctx: createActorContext({
      kind: 'system',
      service: 'cloud-computer-gateway',
      capabilities: [],
    }),
    clusterId: deployment.clusterId,
  })
  if (!cluster?.kubeconfigEncrypted) return undefined
  return decrypt(cluster.kubeconfigEncrypted)
}

function ackError(
  ack: ((res: TerminalStartAck) => void) | undefined,
  error: unknown,
  code?: string,
) {
  const message = error instanceof Error ? error.message : String(error)
  if (typeof ack === 'function') ack({ ok: false, error: message, code })
}

export function setupCloudComputerGateway(io: SocketIOServer, container: AppContainer): void {
  io.on('connection', (socket: Socket) => {
    const sessions = new Map<string, TerminalSessionEntry>()

    socket.on(
      'cloud-computer:terminal:start',
      async (payload: unknown, ack?: (res: TerminalStartAck) => void) => {
        // Security: actor=user socket, resource=cloud_computer:{id}/pod:{pod},
        // action=manage, capability=cloud:terminal, data class=cloud-secret terminal stream.
        const parsed = terminalStartSchema.safeParse(payload)
        if (!parsed.success) {
          ackError(ack, new Error('Invalid terminal request'), 'invalid_payload')
          return
        }

        const actor = socketActor(socket)
        if (!actor || actor.kind !== 'user') {
          ackError(ack, new Error('Interactive terminal requires a user session'), 'forbidden')
          return
        }

        try {
          const deployment = await resolveCloudComputerDeployment(
            container,
            actor,
            parsed.data.computerId,
          )
          if (!deployment) {
            ackError(ack, new Error('Cloud computer not found'), 'not_found')
            return
          }

          const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
          const k8sGateway = container.resolve('kubernetesOpsGateway')
          const pods = await k8sGateway.listPods(deployment.namespace, kubeconfig)
          let selectedPod = parsed.data.pod
            ? pods.find((pod) => pod.name === parsed.data.pod)
            : undefined
          const agentName = parsed.data.agent
          if (!selectedPod && agentName) {
            selectedPod = pods.find((pod) => pod.name === agentName || pod.name.includes(agentName))
          }
          selectedPod ??= pods.find((pod) => pod.status === 'Running') ?? pods[0]
          if (!selectedPod) {
            ackError(ack, new Error('No pods found for this cloud computer'), 'pod_not_found')
            return
          }

          const runtimeTarget = parsed.data.agent
            ? resolveRuntimeStateTarget(deployment, parsed.data.agent)
            : null
          const containerName = parsed.data.container ?? runtimeTarget?.containerName
          const terminal = await k8sGateway.spawnInteractiveTerminal({
            namespace: deployment.namespace,
            pod: selectedPod.name,
            container: containerName,
            kubeconfig,
            shell: parsed.data.shell,
            cols: parsed.data.cols,
            rows: parsed.data.rows,
          })
          const sessionId = randomUUID()
          sessions.set(sessionId, {
            terminal,
            computerId: parsed.data.computerId,
            pod: selectedPod.name,
            ...(containerName ? { container: containerName } : {}),
          })

          terminal.onData((data) => {
            socket.emit('cloud-computer:terminal:data', { sessionId, data })
          })
          terminal.onExit((event) => {
            sessions.delete(sessionId)
            socket.emit('cloud-computer:terminal:exit', {
              sessionId,
              exitCode: event.exitCode,
              signal: event.signal,
            })
          })

          if (typeof ack === 'function') {
            ack({
              ok: true,
              sessionId,
              namespace: deployment.namespace,
              pod: selectedPod.name,
              ...(containerName ? { container: containerName } : {}),
            })
          }
        } catch (err) {
          logger.warn({ err, socketId: socket.id }, 'Failed to start cloud computer terminal')
          ackError(ack, err)
        }
      },
    )

    socket.on('cloud-computer:terminal:input', (payload: unknown) => {
      const parsed = terminalInputSchema.safeParse(payload)
      if (!parsed.success) return
      sessions.get(parsed.data.sessionId)?.terminal.write(parsed.data.data)
    })

    socket.on('cloud-computer:terminal:resize', (payload: unknown) => {
      const parsed = terminalResizeSchema.safeParse(payload)
      if (!parsed.success) return
      sessions.get(parsed.data.sessionId)?.terminal.resize(parsed.data.cols, parsed.data.rows)
    })

    socket.on('cloud-computer:terminal:stop', (payload: unknown) => {
      const parsed = terminalStopSchema.safeParse(payload)
      if (!parsed.success) return
      const entry = sessions.get(parsed.data.sessionId)
      sessions.delete(parsed.data.sessionId)
      entry?.terminal.kill()
    })

    socket.on('disconnect', () => {
      for (const entry of sessions.values()) {
        entry.terminal.kill()
      }
      sessions.clear()
    })
  })
}
