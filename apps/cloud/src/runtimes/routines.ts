import { createHash } from 'node:crypto'
import type { AgentDeployment, CloudConfig, CloudRoutineConfig } from '../config/schema.js'
import type { PluginRoutineDelivery, PluginRuntimeExtension } from '../plugins/types.js'
import { SHADOWOB_CONFIG_MOUNT_PATH } from './container.js'
import type { RuntimeFiles, RuntimeKind } from './index.js'
import { json } from './package-common.js'

export const SHADOWOB_TEMPLATE_ROUTINES_PATH = `${SHADOWOB_CONFIG_MOUNT_PATH}/template-routines.json`

export interface RuntimeTemplateRoutine {
  id: string
  agentId: string
  title?: string
  description?: string
  enabled: boolean
  schedule: CloudRoutineConfig['schedule']
  prompt: string
  deliveries: PluginRoutineDelivery[]
  metadata?: Record<string, unknown>
  sourceHash: string
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

function sourceHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

function deliveriesForRoutine(
  runtimeExtensions: PluginRuntimeExtension,
  routineId: string,
): PluginRoutineDelivery[] {
  return (runtimeExtensions.routineDeliveries ?? []).filter(
    (delivery) => delivery.routineId === routineId,
  )
}

export function templateRoutinesForAgent(
  config: CloudConfig,
  agent: AgentDeployment,
  runtimeExtensions: PluginRuntimeExtension,
): RuntimeTemplateRoutine[] {
  return (config.routines ?? [])
    .filter((routine) => routine.enabled !== false)
    .filter((routine) => routine.agentId === agent.id)
    .map((routine) => ({
      id: routine.id,
      agentId: routine.agentId,
      ...(routine.title ? { title: routine.title } : {}),
      ...(routine.description ? { description: routine.description } : {}),
      enabled: routine.enabled !== false,
      schedule: routine.schedule,
      prompt: routine.prompt,
      deliveries: deliveriesForRoutine(runtimeExtensions, routine.id),
      ...(routine.metadata ? { metadata: routine.metadata } : {}),
      sourceHash: sourceHash({
        id: routine.id,
        agentId: routine.agentId,
        schedule: routine.schedule,
        prompt: routine.prompt,
        metadata: routine.metadata,
      }),
    }))
}

export function firstRoutineDeliveryTargetValue(
  config: CloudConfig,
  agent: AgentDeployment,
  runtimeExtensions: PluginRuntimeExtension,
  pluginId: string,
  key: string,
): unknown {
  for (const routine of templateRoutinesForAgent(config, agent, runtimeExtensions)) {
    const delivery = routine.deliveries.find((item) => item.pluginId === pluginId)
    if (delivery?.target[key] !== undefined) return delivery.target[key]
  }
  return undefined
}

export function appendTemplateRoutineFiles(
  files: RuntimeFiles,
  config: CloudConfig,
  agent: AgentDeployment,
  runtimeKind: RuntimeKind,
  runtimeExtensions: PluginRuntimeExtension,
): void {
  const routines = templateRoutinesForAgent(config, agent, runtimeExtensions)
  if (routines.length === 0) return

  files[SHADOWOB_TEMPLATE_ROUTINES_PATH] = json({
    version: 1,
    agentId: agent.id,
    runtime: runtimeKind,
    syncPolicy: 'preserve-runtime-edits',
    notes:
      'Template routine seed. Runtime sync must preserve user-edited jobs unless the previous sourceHash still matches.',
    routines,
  })
}
