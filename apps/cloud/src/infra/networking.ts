/**
 * Networking — Kubernetes Service via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import { PULUMI_MANAGED_ANNOTATIONS, PULUMI_SKIP_AWAIT_ANNOTATIONS } from './constants.js'

export interface NetworkingOptions {
  agentName: string
  namespace: string | pulumi.Input<string>
  port: number
  targetPort?: number
  provider: k8s.Provider
  resourceOptions?: pulumi.CustomResourceOptions
}

export function createNetworking(options: NetworkingOptions) {
  const { agentName, namespace, port, targetPort, provider, resourceOptions } = options

  const service = new k8s.core.v1.Service(
    `${agentName}-svc`,
    {
      metadata: {
        name: `${agentName}-svc`,
        namespace,
        labels: {
          app: 'shadowob-cloud',
          agent: agentName,
        },
        annotations: {
          ...PULUMI_MANAGED_ANNOTATIONS,
          ...PULUMI_SKIP_AWAIT_ANNOTATIONS,
        },
      },
      spec: {
        selector: {
          app: 'shadowob-cloud',
          agent: agentName,
        },
        ports: [
          {
            name: 'health',
            port,
            targetPort: targetPort ?? port,
            protocol: 'TCP',
          },
        ],
        type: 'ClusterIP',
      },
    },
    { provider, ...resourceOptions },
  )

  return { service }
}
