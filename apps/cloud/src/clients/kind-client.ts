/**
 * kind cluster management — auto-create local Kubernetes clusters.
 */

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { log } from '../utils/logger.js'

const KIND_CLUSTER_NAME = 'shadowob-cloud'
const execFileAsync = promisify(execFile)

function runInheritedCommand(command: string, args: string[], timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit' })
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`${command} timed out after ${timeout}ms`))
    }, timeout)

    proc.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code ?? 1}`))
    })
  })
}

/**
 * Check if a command-line tool is installed.
 */
export async function isInstalled(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

/**
 * Check if kubectl can connect to a cluster.
 */
export async function isKubeReachable(): Promise<boolean> {
  try {
    await execFileAsync('kubectl', ['cluster-info'], { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

/**
 * Check if kind cluster exists.
 */
export async function kindClusterExists(name = KIND_CLUSTER_NAME): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('kind', ['get', 'clusters'], {
      encoding: 'utf-8',
      timeout: 10_000,
    })
    return stdout.split('\n').some((line) => line.trim() === name)
  } catch {
    return false
  }
}

/**
 * Create a kind cluster for local development.
 */
export async function createKindCluster(name = KIND_CLUSTER_NAME): Promise<void> {
  if (!(await isInstalled('kind'))) {
    throw new Error(
      'kind is not installed. Install it: https://kind.sigs.k8s.io/docs/user/quick-start/',
    )
  }

  if (await kindClusterExists(name)) {
    log.dim(`kind cluster "${name}" already exists`)
    return
  }

  log.step(`Creating kind cluster "${name}"...`)
  await runInheritedCommand('kind', ['create', 'cluster', '--name', name, '--wait', '60s'], 120_000)

  log.success(`kind cluster "${name}" created`)
}

/**
 * Load a local Docker image into kind cluster.
 */
export async function loadImageToKind(
  imageName: string,
  clusterName = KIND_CLUSTER_NAME,
): Promise<void> {
  log.dim(`Loading image ${imageName} into kind cluster...`)
  await runInheritedCommand(
    'kind',
    ['load', 'docker-image', imageName, '--name', clusterName],
    120_000,
  )
}

/**
 * Delete a kind cluster.
 */
export async function deleteKindCluster(name = KIND_CLUSTER_NAME): Promise<void> {
  if (!(await kindClusterExists(name))) return
  log.step(`Deleting kind cluster "${name}"...`)
  await runInheritedCommand('kind', ['delete', 'cluster', '--name', name], 60_000)
  log.success(`kind cluster "${name}" deleted`)
}
