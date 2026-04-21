/**
 * Pulumi automation API client — stack lifecycle management.
 *
 * Uses Pulumi's programmatic automation API for creating, deploying,
 * and destroying K8s stacks without requiring the Pulumi CLI.
 */

import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as automation from '@pulumi/pulumi/automation/index.js'
import { PulumiCommand } from '@pulumi/pulumi/automation/index.js'
import type { CloudConfig } from '../config/schema.js'
import { createInfraProgram, type InfraOptions } from '../infra/index.js'

/** Cached PulumiCommand instance (installed once). */
let cachedPulumiCommand: automation.PulumiCommand | null = null

export interface StackOptions {
  projectName?: string
  stackName: string
  config: CloudConfig
  namespace: string
  shadowServerUrl?: string
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
  return process.env.PULUMI_BACKEND_URL
    ? '' // if already set, don't override
    : join(homedir(), '.shadowob', 'pulumi')
}

/**
 * Create or select a Pulumi stack for shadowob-cloud deployments.
 * Uses a local file backend by default for reproducible, offline operation.
 */
export async function getOrCreateStack(options: StackOptions) {
  const infraOpts: InfraOptions = {
    config: options.config,
    namespace: options.namespace,
    shadowServerUrl: options.shadowServerUrl,
    kubeContext: options.kubeContext ?? process.env.KUBECONFIG_CONTEXT ?? 'rancher-desktop',
    kubeConfigPath: options.kubeConfigPath,
    imagePullPolicy: options.imagePullPolicy ?? 'IfNotPresent',
  }

  const stateDir = options.stateDir ?? getDefaultStateDir()
  const backendUrl = process.env.PULUMI_BACKEND_URL ?? (stateDir ? `file://${stateDir}` : undefined)

  // Ensure local file backend directory exists before Pulumi tries to open it
  if (backendUrl?.startsWith('file://')) {
    const dir = new URL(backendUrl).pathname
    await mkdir(dir, { recursive: true })
  } else if (stateDir) {
    await mkdir(stateDir, { recursive: true })
  }

  // Pulumi reads PULUMI_CONFIG_PASSPHRASE from process.env during stack init
  // Set it now so that the pulumi binary subprocess can see it
  if (!process.env.PULUMI_CONFIG_PASSPHRASE) {
    process.env.PULUMI_CONFIG_PASSPHRASE = ''
  }
  if (backendUrl) {
    process.env.PULUMI_BACKEND_URL = backendUrl
  }

  // Ensure the Pulumi CLI binary is available (install if needed)
  if (!cachedPulumiCommand) {
    const cliRoot = join(homedir(), '.shadowob', 'pulumi', 'cli')
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

  const workspaceOpts: automation.LocalWorkspaceOptions = {
    pulumiCommand: cachedPulumiCommand,
    projectSettings: {
      name: options.projectName ?? 'shadowob-cloud',
      runtime: 'nodejs',
      backend: backendUrl ? { url: backendUrl } : undefined,
    },
    envVars: {
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
  options?: { dryRun?: boolean; onOutput?: (out: string) => void },
) {
  const run = () => {
    if (options?.dryRun) {
      return stack.preview({ onOutput: options.onOutput })
    }
    return stack.up({ onOutput: options?.onOutput, refresh: true })
  }

  try {
    return await run()
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('locked by') || msg.includes('locked')) {
      // Try to cancel and retry
      try {
        await stack.cancel()
      } catch {
        /* ignore */
      }
      return await run()
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
  return stack.destroy({ onOutput: options?.onOutput })
}

/**
 * Get stack outputs (service IPs, deployment names, etc.).
 */
export async function getStackOutputs(stack: automation.Stack) {
  return stack.outputs()
}
