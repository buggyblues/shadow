/**
 * Networking — Kubernetes Service via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import { PULUMI_MANAGED_ANNOTATIONS, PULUMI_SKIP_AWAIT_ANNOTATIONS } from './constants.js'
import { serviceNameForAgent } from './k8s-names.js'

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
  const serviceName = serviceNameForAgent(agentName)

  const service = new k8s.core.v1.Service(
    serviceName,
    {
      metadata: {
        name: serviceName,
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
