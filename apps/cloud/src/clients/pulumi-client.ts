/**
 * Pulumi automation API client — stack lifecycle management.
 *
 * Uses Pulumi's programmatic automation API for creating, deploying,
 * and destroying K8s stacks without requiring the Pulumi CLI.
 */

import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import * as automation from '@pulumi/pulumi/automation/index.js'
import { PulumiCommand } from '@pulumi/pulumi/automation/index.js'
import type { CloudConfig } from '../config/schema.js'
import { createInfraProgram, type InfraOptions } from '../infra/index.js'
import type { DeploymentRuntimeContext } from '../utils/runtime-context.js'

/** Cached PulumiCommand instance (installed once). */
let cachedPulumiCommand: automation.PulumiCommand | null = null
let cachedPulumiBackendUrl: string | null = null
const execFileAsync = promisify(execFile)

function getNonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]

  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export interface StackOptions {
  projectName?: string
  stackName: string
  config: CloudConfig
  namespace: string
  shadowServerUrl?: string
  /** Per-deployment runtime env resolved from SaaS/user input. */
  runtimeEnvVars?: Record<string, string>
  /** Browser/deployment locale and timezone context. */
  runtimeContext?: DeploymentRuntimeContext
  /** Directory to store Pulumi local state — defaults to ~/.shadowob/pulumi */
  stateDir?: string
  /** kubectl context for K8s provider */
  kubeContext?: string
  /** Path to a kubeconfig YAML file — takes precedence over kubeContext when set */
  kubeConfigPath?: string
  /** Image pull policy for containers */
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
}

function getDefaultStateDir(): string {
  return getNonEmptyEnv('PULUMI_BACKEND_URL')
    ? '' // if already set, don't override
    : join(homedir(), '.shadowob', 'pulumi')
}

export function resolvePulumiBackendUrl(stateDir?: string): string | undefined {
  return getNonEmptyEnv('PULUMI_BACKEND_URL') ?? (stateDir ? `file://${stateDir}` : undefined)
}

export function ensurePulumiCliOnPath(cliRoot: string): string {
  const binDir = join(cliRoot, 'bin')
  const currentPath = process.env.PATH ?? ''
  const parts = currentPath.split(delimiter).filter(Boolean)

  if (!parts.includes(binDir)) {
    process.env.PATH = [binDir, ...parts].join(delimiter)
  }

  return binDir
}

async function loginToPulumiBackend(backendUrl: string, pulumiHome: string): Promise<void> {
  if (!backendUrl || cachedPulumiBackendUrl === backendUrl) return

  try {
    await execFileAsync('pulumi', ['login', backendUrl, '--non-interactive'], {
      env: {
        ...process.env,
        PULUMI_BACKEND_URL: backendUrl,
        PULUMI_HOME: pulumiHome,
      },
    })
    cachedPulumiBackendUrl = backendUrl
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error && error.stderr
        ? String(error.stderr)
        : ''
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Pulumi login failed for backend ${backendUrl}: ${message}${stderr ? `\n${stderr}` : ''}`,
    )
  }
}

/**
 * Create or select a Pulumi stack for shadowob-cloud deployments.
 * Uses a local file backend by default for reproducible, offline operation.
 */
export async function getOrCreateStack(options: StackOptions) {
  const cliRoot = join(homedir(), '.shadowob', 'pulumi', 'cli')
  const pulumiHome = join(homedir(), '.shadowob', 'pulumi', 'home')
  const infraOpts: InfraOptions = {
    config: options.config,
    namespace: options.namespace,
    shadowServerUrl: options.shadowServerUrl,
    runtimeEnvVars: options.runtimeEnvVars,
    runtimeContext: options.runtimeContext,
    kubeContext: options.kubeContext ?? process.env.KUBECONFIG_CONTEXT ?? 'rancher-desktop',
    kubeConfigPath: options.kubeConfigPath,
    imagePullPolicy: options.imagePullPolicy,
  }

  const stateDir = options.stateDir ?? getDefaultStateDir()
  const backendUrl = resolvePulumiBackendUrl(stateDir)

  // Ensure local file backend directory exists before Pulumi tries to open it
  if (backendUrl?.startsWith('file://')) {
    const dir = new URL(backendUrl).pathname
    await mkdir(dir, { recursive: true })
  } else if (stateDir) {
    await mkdir(stateDir, { recursive: true })
  }
  await mkdir(pulumiHome, { recursive: true })

  // Pulumi reads PULUMI_CONFIG_PASSPHRASE from process.env during stack init
  // Set it now so that the pulumi binary subprocess can see it
  if (!process.env.PULUMI_CONFIG_PASSPHRASE) {
    process.env.PULUMI_CONFIG_PASSPHRASE = ''
  }
  if (backendUrl) {
    process.env.PULUMI_BACKEND_URL = backendUrl
  } else {
    delete process.env.PULUMI_BACKEND_URL
  }

  // Ensure the Pulumi CLI binary is available (install if needed)
  if (!cachedPulumiCommand) {
    ensurePulumiCliOnPath(cliRoot)

    try {
      cachedPulumiCommand = await PulumiCommand.get({ skipVersionCheck: true })
    } catch {
      // Not on PATH — try our known install directory
      try {
        cachedPulumiCommand = await PulumiCommand.get({ root: cliRoot, skipVersionCheck: true })
      } catch {
        // Not installed anywhere — download and install to ~/.shadowob/pulumi/cli/
        try {
          await mkdir(cliRoot, { recursive: true })
          cachedPulumiCommand = await PulumiCommand.install({
            root: cliRoot,
            skipVersionCheck: true,
          })
          ensurePulumiCliOnPath(cliRoot)
        } catch (installErr) {
          throw new Error(
            `Pulumi CLI not found and auto-install failed. ` +
              `Install manually: https://www.pulumi.com/docs/install/ ` +
              `(${(installErr as Error).message})`,
          )
        }
      }
    }
  }

  if (backendUrl) {
    ensurePulumiCliOnPath(cliRoot)
    await loginToPulumiBackend(backendUrl, pulumiHome)
  }

  const inheritedEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )

  const workspaceOpts: automation.LocalWorkspaceOptions = {
    pulumiCommand: cachedPulumiCommand,
    pulumiHome,
    projectSettings: {
      name: options.projectName ?? 'shadowob-cloud',
      runtime: 'nodejs',
      backend: backendUrl ? { url: backendUrl } : undefined,
    },
    envVars: {
      ...inheritedEnv,
      PULUMI_HOME: pulumiHome,
      ...(backendUrl ? { PULUMI_BACKEND_URL: backendUrl } : {}),
      // Disable Pulumi telemetry in tests/CI
      PULUMI_SKIP_UPDATE_CHECK: '1',
      // Use empty passphrase for local file backend (no secrets encryption needed in dev)
      PULUMI_CONFIG_PASSPHRASE: process.env.PULUMI_CONFIG_PASSPHRASE ?? '',
    },
  }

  return automation.LocalWorkspace.createOrSelectStack({
    projectName: options.projectName ?? 'shadowob-cloud',
    stackName: options.stackName,
    program: createInfraProgram(infraOpts),
    ...workspaceOpts,
  })
}

/**
 * Deploy the stack (pulumi up).
 * Automatically handles lock conflicts by attempting cancel + retry.
 */
export async function deployStack(
  stack: automation.Stack,
  options?: {
    dryRun?: boolean
    onOutput?: (out: string) => void
    isCancelled?: () => boolean
    cancelPollMs?: number
  },
) {
  const run = () => {
    if (options?.dryRun) {
      return stack.preview({ onOutput: options.onOutput })
    }
    return stack.up({ onOutput: options?.onOutput, refresh: true })
  }

  const runWithCancellation = async () => {
    if (!options?.isCancelled) return await run()

    let cancelTimer: NodeJS.Timeout | undefined
    const operation = run()
    const cancellation = new Promise<never>((_resolve, reject) => {
      cancelTimer = setInterval(() => {
        if (!options.isCancelled?.()) return
        clearInterval(cancelTimer)
        options.onOutput?.('\nCancellation requested; signaling Pulumi stack...\n')
        void stack
          .cancel()
          .catch((err) => {
            options.onOutput?.(
              `Pulumi cancellation signal failed: ${err instanceof Error ? err.message : String(err)}\n`,
            )
          })
          .finally(() => reject(new Error('Deployment cancelled by user')))
      }, options.cancelPollMs ?? 1_000)
    })

    try {
      return await Promise.race([operation, cancellation])
    } finally {
      if (cancelTimer) clearInterval(cancelTimer)
    }
  }

  try {
    return await runWithCancellation()
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg === 'Deployment cancelled by user') throw err
    if (msg.includes('locked by') || msg.includes('locked')) {
      // Try to cancel and retry
      try {
        await stack.cancel()
      } catch {
        /* ignore */
      }
      return await runWithCancellation()
    }
    throw err
  }
}

/**
 * Destroy the stack (pulumi destroy).
 */
export async function destroyStack(
  stack: automation.Stack,
  options?: { onOutput?: (out: string) => void },
) {
  return stack.destroy({ onOutput: options?.onOutput, refresh: true })
}

/**
 * Get stack outputs (service IPs, deployment names, etc.).
 */
export async function getStackOutputs(stack: automation.Stack) {
  return stack.outputs()
}
