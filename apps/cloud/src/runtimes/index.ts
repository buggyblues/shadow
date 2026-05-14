import type {
  AgentDeployment,
  AgentRuntime,
  CloudConfig,
  OpenClawConfig,
} from '../config/schema.js'
import type { PluginRuntimeExtension } from '../plugins/types.js'
import type { DeploymentRuntimeContext } from '../utils/runtime-context.js'

export type RuntimeKind = 'openclaw' | 'cc-connect' | 'hermes'
export type RuntimeEnv = Record<string, string | undefined>
export type RuntimeFiles = Record<string, string>

export interface RuntimePackageBuildContext {
  agent: AgentDeployment
  config: CloudConfig
  cwd?: string
  runtimeEnv: RuntimeEnv
  runtimeExtensions: PluginRuntimeExtension
  runtimeContext?: DeploymentRuntimeContext
}

export interface RuntimePackageBuildResult {
  openclawConfig?: OpenClawConfig
  configData: Record<string, string>
  pluginResources: Record<string, unknown>[]
  provisionSecrets?: Record<string, string>
}

export interface RuntimeContainerSpec {
  homeDir: string
  healthPort: number
  statePath: string
  logPath: string
  env: Array<{ name: string; value: string }>
}

/**
 * Runtime adapter interface — one per supported runtime type. Package generation
 * lives with the concrete runtime so the shared infra layer does not know native
 * config details for Claude, Codex, OpenCode, Gemini, Hermes, or OpenClaw.
 */
export interface RuntimeAdapter {
  /** Runtime identifier (matches AgentRuntime type) */
  readonly id: AgentRuntime

  /** Human-readable name */
  readonly name: string

  /** Native runner package family. */
  readonly runtimeKind: RuntimeKind

  /** Default container image when not overridden by user */
  readonly defaultImage: string

  /** Kubernetes/container layout for this runtime. */
  readonly container: RuntimeContainerSpec

  /** Build the runtime's ConfigMap payload and plugin resource artifacts. */
  buildPackage(context: RuntimePackageBuildContext): RuntimePackageBuildResult
}

// ─── Adapter Registry ─────────────────────────────────────────────────────

const registry = new Map<string, RuntimeAdapter>()

/**
 * Register a runtime adapter. Called by each adapter module at import time.
 */
export function registerRuntime(adapter: RuntimeAdapter): void {
  if (registry.has(adapter.id)) {
    throw new Error(`Runtime adapter "${adapter.id}" already registered`)
  }
  registry.set(adapter.id, adapter)
}

/**
 * Get a runtime adapter by ID. Throws if not found.
 */
export function getRuntime(id: string): RuntimeAdapter {
  const adapter = registry.get(id)
  if (!adapter) {
    const available = [...registry.keys()].join(', ')
    throw new Error(`Unknown runtime "${id}". Available: ${available}`)
  }
  return adapter
}

/**
 * Get all registered runtime adapters.
 */
export function getAllRuntimes(): RuntimeAdapter[] {
  return [...registry.values()]
}

/**
 * Get all registered runtime IDs.
 */
export function getRuntimeIds(): string[] {
  return [...registry.keys()]
}
