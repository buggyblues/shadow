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
  type DeploymentStatus,
  deleteNamespace,
  execInPod,
  getDeployments,
  getManagedNamespaces,
  getPods,
  type PodStatus,
  readLogs,
  rolloutRestartAll,
  rolloutUndoAll,
  scaleDeployment,
  streamLogs,
} from '../clients/kubectl-client.js'
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
  setupLocalCluster(imageName?: string): void {
    if (!kindClusterExists()) {
      createKindCluster()
    }
    if (imageName) {
      loadImageToKind(imageName)
    }
  }

  // ─── Pulumi Stack Operations ──────────────────────────────────────────

  async getOrCreateStack(options: StackOptions) {
    return getOrCreateStack(options)
  }

  async deployStack(
    stack: Awaited<ReturnType<typeof getOrCreateStack>>,
    options?: { dryRun?: boolean; onOutput?: (out: string) => void },
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

  // ─── kubectl Operations ───────────────────────────────────────────────

  getDeployments(namespace: string): DeploymentStatus[] {
    return getDeployments(namespace)
  }

  getPods(namespace: string): PodStatus[] {
    return getPods(namespace)
  }

  streamLogs(
    namespace: string,
    podName: string,
    options?: { follow?: boolean; tail?: number },
  ): ChildProcess {
    return streamLogs(namespace, podName, options)
  }

  readLogs(
    namespace: string,
    podName: string,
    options?: { tail?: number; timestamps?: boolean },
  ): string {
    return readLogs(namespace, podName, options)
  }

  execInPod(
    namespace: string,
    podName: string,
    command: string[],
    options?: { timeout?: number },
  ): CommandResult {
    return execInPod(namespace, podName, command, options)
  }

  scaleDeployment(namespace: string, name: string, replicas: number): void {
    scaleDeployment(namespace, name, replicas)
  }

  /**
   * List namespaces labeled `managed-by=shadowob-cloud-cli` on the cluster.
   */
  getManagedNamespaces(): string[] {
    return getManagedNamespaces()
  }

  /**
   * Delete a namespace and all its resources.
   */
  deleteNamespace(namespace: string): void {
    deleteNamespace(namespace)
  }

  /**
   * Rollout restart all deployments in a namespace.
   */
  rolloutRestartAll(namespace: string): void {
    rolloutRestartAll(namespace)
  }

  /**
   * Rollback all deployments in a namespace to the previous revision.
   */
  rolloutUndoAll(namespace: string): void {
    rolloutUndoAll(namespace)
  }

  // ─── Kind Cluster Management ──────────────────────────────────────────

  isToolInstalled(cmd: string): boolean {
    return isInstalled(cmd)
  }

  isKubeReachable(): boolean {
    return isKubeReachable()
  }

  kindClusterExists(): boolean {
    return kindClusterExists()
  }

  createKindCluster(): void {
    createKindCluster()
  }

  deleteKindCluster(): void {
    deleteKindCluster()
  }

  loadImageToKind(imageName: string): void {
    loadImageToKind(imageName)
  }
}
