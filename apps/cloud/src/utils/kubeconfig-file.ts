import { existsSync, readFileSync, statSync } from 'node:fs'
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

export function assertReadableKubeconfigFile(
  kubeconfigPath: string,
  label = 'Kubernetes kubeconfig',
): void {
  if (!existsSync(kubeconfigPath)) {
    throw new Error(`${label} not found at ${kubeconfigPath}. ${kubeconfigSetupHint()}`)
  }

  let stat
  try {
    stat = statSync(kubeconfigPath)
  } catch (err) {
    throw new Error(
      `Failed to inspect ${label} at ${kubeconfigPath}: ${(err as Error).message}. ` +
        kubeconfigSetupHint(),
    )
  }

  if (stat.isDirectory()) {
    throw new Error(
      `${label} path ${kubeconfigPath} is a directory, not a file. ` +
        'This usually means Docker created the bind-mount target because the host kubeconfig file is missing. ' +
        kubeconfigSetupHint(),
    )
  }

  if (!stat.isFile()) {
    throw new Error(
      `${label} path ${kubeconfigPath} is not a regular file. ${kubeconfigSetupHint()}`,
    )
  }

  if (stat.size === 0) {
    throw new Error(`${label} at ${kubeconfigPath} is empty. ${kubeconfigSetupHint()}`)
  }
}

export function readKubeconfigFile(
  kubeconfigPath: string,
  label = 'Kubernetes kubeconfig',
): string {
  assertReadableKubeconfigFile(kubeconfigPath, label)

  try {
    return readFileSync(kubeconfigPath, 'utf8')
  } catch (err) {
    throw new Error(
      `Failed to read ${label} at ${kubeconfigPath}: ${(err as Error).message}. ` +
        kubeconfigSetupHint(),
    )
  }
}

export function findReadableKubeconfigPath(
  candidates: Array<string | undefined>,
  label = 'Kubernetes kubeconfig',
): string | undefined {
  const uniqueCandidates = [
    ...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate))),
  ]

  for (const candidate of uniqueCandidates) {
    if (!existsSync(candidate)) continue
    assertReadableKubeconfigFile(candidate, label)
    return candidate
  }

  return undefined
}
