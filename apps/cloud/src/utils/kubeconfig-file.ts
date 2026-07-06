import { access, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function defaultKubeconfigPath(): string {
  return join(homedir(), '.kube', 'config')
}

function kubeconfigSetupHint(): string {
  return (
    'Configure KUBECONFIG_HOST_PATH or CLOUD_SAAS_CLUSTER_KUBECONFIG_HOST_PATH to an existing ' +
    'host kubeconfig file, or initialize/import a cluster before deploying.'
  )
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export async function assertReadableKubeconfigFile(
  kubeconfigPath: string,
  label = 'Kubernetes kubeconfig',
): Promise<void> {
  if (!(await pathExists(kubeconfigPath))) {
    throw new Error(`${label} not found at ${kubeconfigPath}. ${kubeconfigSetupHint()}`)
  }

  let fileStat
  try {
    fileStat = await stat(kubeconfigPath)
  } catch (err) {
    throw new Error(
      `Failed to inspect ${label} at ${kubeconfigPath}: ${(err as Error).message}. ` +
        kubeconfigSetupHint(),
    )
  }

  if (fileStat.isDirectory()) {
    throw new Error(
      `${label} path ${kubeconfigPath} is a directory, not a file. ` +
        'This usually means Docker created the bind-mount target because the host kubeconfig file is missing. ' +
        kubeconfigSetupHint(),
    )
  }

  if (!fileStat.isFile()) {
    throw new Error(
      `${label} path ${kubeconfigPath} is not a regular file. ${kubeconfigSetupHint()}`,
    )
  }

  if (fileStat.size === 0) {
    throw new Error(`${label} at ${kubeconfigPath} is empty. ${kubeconfigSetupHint()}`)
  }
}

export async function readKubeconfigFile(
  kubeconfigPath: string,
  label = 'Kubernetes kubeconfig',
): Promise<string> {
  await assertReadableKubeconfigFile(kubeconfigPath, label)

  try {
    return await readFile(kubeconfigPath, 'utf8')
  } catch (err) {
    throw new Error(
      `Failed to read ${label} at ${kubeconfigPath}: ${(err as Error).message}. ` +
        kubeconfigSetupHint(),
    )
  }
}

export async function findReadableKubeconfigPath(
  candidates: Array<string | undefined>,
  label = 'Kubernetes kubeconfig',
): Promise<string | undefined> {
  const uniqueCandidates = [
    ...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate))),
  ]

  for (const candidate of uniqueCandidates) {
    if (!(await pathExists(candidate))) continue
    await assertReadableKubeconfigFile(candidate, label)
    return candidate
  }

  return undefined
}
