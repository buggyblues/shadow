/**
 * Networking — Kubernetes Service via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'

export interface NetworkingOptions {
  agentName: string
  namespace: string | pulumi.Input<string>
  port: number
  provider: k8s.Provider
  resourceOptions?: pulumi.CustomResourceOptions
}

export function createNetworking(options: NetworkingOptions) {
  const { agentName, namespace, port, provider, resourceOptions } = options

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
            targetPort: port,
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
