/**
 * ClusterService — orchestrates cluster lifecycle operations.
 *
 * Thin service layer that delegates to cluster/* modules.
 * Registered in the ServiceContainer for CLI command use.
 */

import { destroyCluster } from '../cluster/destroy.js'
import { initCluster } from '../cluster/init.js'
import { listRegisteredClusters, loadKubeconfigPath } from '../cluster/kubeconfig.js'
import type { ClusterConfig, ClusterMeta } from '../cluster/schema.js'
import { type ClusterStatus, getClusterStatus } from '../cluster/status.js'

export class ClusterService {
  /**
   * Bootstrap a k3s cluster on bare servers.
   */
  async init(
    config: ClusterConfig,
    onLog?: (msg: string) => void,
    force?: boolean,
  ): Promise<ClusterMeta> {
    return initCluster({ config, onLog, force })
  }

  /**
   * Check SSH connectivity and k3s status on all nodes.
   */
  async status(config: ClusterConfig): Promise<ClusterStatus> {
    return getClusterStatus(config)
  }

  /**
   * Uninstall k3s from all nodes and clean up local files.
   */
  async destroy(config: ClusterConfig, onLog?: (msg: string) => void): Promise<void> {
    return destroyCluster({ config, onLog })
  }

  /**
   * List all clusters with stored kubeconfigs.
   */
  async listClusters(): Promise<ClusterMeta[]> {
    return await listRegisteredClusters()
  }

  /**
   * Resolve the kubeconfig file path for a named cluster.
   * Throws if the cluster is not registered.
   */
  async resolveKubeconfig(clusterName: string): Promise<string> {
    return await loadKubeconfigPath(clusterName)
  }
}
