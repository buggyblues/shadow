/**
 * K8sService — Kubernetes cluster operations.
 *
 * Wraps clients/pulumi-client (Pulumi automation), clients/kubectl-client
 * (operational commands), and clients/kind-client (local cluster management)
 * as an injectable service.
 */

import type { ChildProcess } from 'node:child_process'
import {
  createKindCluster,
  deleteKindCluster,
  isInstalled,
  isKubeReachable,
  kindClusterExists,
  loadImageToKind,
} from '../clients/kind-client.js'
import {
  type CommandResult,
  createVolumeSnapshotBackup,
  type DeploymentStatus,
  deleteNamespace,
  execInPod,
  getDeployments,
  getManagedNamespaces,
  getPods,
  type PodStatus,
  pauseAgentSandbox,
  readLogs,
  resumeAgentSandbox,
  rolloutRestartAll,
  rolloutUndoAll,
  scaleAgentSandbox,
  scaleDeployment,
  streamLogs,
} from '../clients/kubectl-client.js'
import {
  type AgentSandboxPreflightResult,
  checkAgentSandboxPreflight,
  createVolumeSnapshotBackupAsync,
  namespaceExists,
  restorePvcFromVolumeSnapshot,
  waitForAgentSandboxPaused,
  waitForAgentSandboxReady,
  waitForVolumeSnapshotReady,
} from '../clients/kubectl-runtime.js'
import {
  deployStack,
  destroyStack,
  getOrCreateStack,
  getStackOutputs,
  type StackOptions,
} from '../clients/pulumi-client.js'

export class K8sService {
  // ─── Composite Operations ─────────────────────────────────────────────

  /**
   * Deploy config to K8s in one call: create stack + deploy.
   * Returns stack outputs on success.
   */
  async deploy(options: StackOptions & { dryRun?: boolean; onOutput?: (out: string) => void }) {
    const { dryRun, onOutput, ...stackOpts } = options
    const stack = await getOrCreateStack(stackOpts)
    await deployStack(stack, { dryRun, onOutput })
    return dryRun ? {} : await getStackOutputs(stack)
  }

  /**
   * Setup a local kind cluster, creating it if needed.
   * Optionally loads an image into the cluster.
   */
  async setupLocalCluster(imageName?: string): Promise<void> {
    if (!(await kindClusterExists())) {
      await createKindCluster()
    }
    if (imageName) {
      await loadImageToKind(imageName)
    }
  }

  // ─── Pulumi Stack Operations ──────────────────────────────────────────

  async getOrCreateStack(options: StackOptions) {
    return getOrCreateStack(options)
  }

  async deployStack(
    stack: Awaited<ReturnType<typeof getOrCreateStack>>,
    options?: { dryRun?: boolean; onOutput?: (out: string) => void; isCancelled?: () => boolean },
  ) {
    return deployStack(stack, options)
  }

  async destroyStack(
    stack: Awaited<ReturnType<typeof getOrCreateStack>>,
    options?: { onOutput?: (out: string) => void },
  ) {
    return destroyStack(stack, options)
  }

  async getStackOutputs(stack: Awaited<ReturnType<typeof getOrCreateStack>>) {
    return getStackOutputs(stack)
  }

  async removeStackState(stack: Awaited<ReturnType<typeof getOrCreateStack>>) {
    await stack.workspace.removeStack(stack.name, { force: true })
  }

  // ─── kubectl Operations ───────────────────────────────────────────────

  async getDeployments(namespace: string): Promise<DeploymentStatus[]> {
    return await getDeployments(namespace)
  }

  async getPods(namespace: string): Promise<PodStatus[]> {
    return await getPods(namespace)
  }

  async namespaceExists(namespace: string, kubeconfig?: string): Promise<boolean | null> {
    return await namespaceExists(namespace, kubeconfig)
  }

  streamLogs(
    namespace: string,
    podName: string,
    options?: { follow?: boolean; tail?: number },
  ): ChildProcess {
    return streamLogs(namespace, podName, options)
  }

  async readLogs(
    namespace: string,
    podName: string,
    options?: { tail?: number; timestamps?: boolean },
  ): Promise<string> {
    return await readLogs(namespace, podName, options)
  }

  async execInPod(
    namespace: string,
    podName: string,
    command: string[],
    options?: { timeout?: number },
  ): Promise<CommandResult> {
    return await execInPod(namespace, podName, command, options)
  }

  async scaleDeployment(namespace: string, name: string, replicas: number): Promise<void> {
    await scaleDeployment(namespace, name, replicas)
  }

  async scaleAgentSandbox(namespace: string, name: string, replicas: number): Promise<void> {
    await scaleAgentSandbox(namespace, name, replicas)
  }

  async pauseAgentSandbox(namespace: string, name: string): Promise<void> {
    await pauseAgentSandbox(namespace, name)
  }

  async resumeAgentSandbox(namespace: string, name: string): Promise<void> {
    await resumeAgentSandbox(namespace, name)
  }

  async createVolumeSnapshotBackup(options: {
    namespace: string
    snapshotName: string
    pvcName: string
    volumeSnapshotClassName?: string
  }): Promise<void> {
    await createVolumeSnapshotBackup(options)
  }

  async createVolumeSnapshotBackupAndWait(options: {
    namespace: string
    snapshotName: string
    pvcName: string
    volumeSnapshotClassName?: string
    timeoutMs?: number
  }): Promise<void> {
    await createVolumeSnapshotBackupAsync(options)
    await waitForVolumeSnapshotReady({
      namespace: options.namespace,
      snapshotName: options.snapshotName,
      timeoutMs: options.timeoutMs,
    })
  }

  async waitForAgentSandboxReady(options: {
    namespace: string
    agentName: string
    kubeconfig?: string
    timeoutMs?: number
    intervalMs?: number
    isCancelled?: () => boolean
  }) {
    return waitForAgentSandboxReady(options)
  }

  async waitForAgentSandboxPaused(options: {
    namespace: string
    agentName: string
    kubeconfig?: string
    timeoutMs?: number
    intervalMs?: number
  }) {
    return waitForAgentSandboxPaused(options)
  }

  async checkAgentSandboxPreflight(options?: {
    kubeconfig?: string
    runtimeClassName?: string
    runtimeClassNames?: string[]
  }): Promise<AgentSandboxPreflightResult> {
    return await checkAgentSandboxPreflight(options)
  }

  async restorePvcFromVolumeSnapshot(options: {
    namespace: string
    pvcName: string
    snapshotName: string
    timeoutMs?: number
  }): Promise<void> {
    await restorePvcFromVolumeSnapshot(options)
  }

  /**
   * List namespaces labeled `managed-by=shadowob-cloud-cli` on the cluster.
   */
  async getManagedNamespaces(): Promise<string[]> {
    return await getManagedNamespaces()
  }

  /**
   * Delete a namespace and all its resources.
   */
  async deleteNamespace(namespace: string): Promise<void> {
    await deleteNamespace(namespace)
  }

  /**
   * Rollout restart all deployments in a namespace.
   */
  async rolloutRestartAll(namespace: string): Promise<void> {
    await rolloutRestartAll(namespace)
  }

  /**
   * Rollback all deployments in a namespace to the previous revision.
   */
  async rolloutUndoAll(namespace: string): Promise<void> {
    await rolloutUndoAll(namespace)
  }

  // ─── Kind Cluster Management ──────────────────────────────────────────

  async isToolInstalled(cmd: string): Promise<boolean> {
    return await isInstalled(cmd)
  }

  async isKubeReachable(): Promise<boolean> {
    return await isKubeReachable()
  }

  async kindClusterExists(): Promise<boolean> {
    return await kindClusterExists()
  }

  async createKindCluster(): Promise<void> {
    await createKindCluster()
  }

  async deleteKindCluster(): Promise<void> {
    await deleteKindCluster()
  }

  async loadImageToKind(imageName: string): Promise<void> {
    await loadImageToKind(imageName)
  }
}
