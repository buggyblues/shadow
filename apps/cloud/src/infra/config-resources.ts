/**
 * Config Resources — Kubernetes ConfigMap and Secret via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import { type AgentRuntimePackage } from './runtime-package.js'

export interface ConfigResourcesOptions {
  agentName: string
  namespace: string | pulumi.Input<string>
  runtimePackage: AgentRuntimePackage
  provider: k8s.Provider
  resourceOptions?: pulumi.CustomResourceOptions
}

export function createConfigResources(options: ConfigResourcesOptions) {
  const { agentName, namespace, runtimePackage, provider, resourceOptions } = options

  const configMapName = `${agentName}-config`
  const secretName = `${agentName}-secrets`

  const configMap = new k8s.core.v1.ConfigMap(
    configMapName,
    {
      metadata: {
        name: configMapName,
        namespace,
        labels: {
          app: 'shadowob-cloud',
          agent: agentName,
        },
      },
      data: runtimePackage.configData,
    },
    { provider, ...resourceOptions },
  )

  const secret = new k8s.core.v1.Secret(
    secretName,
    {
      metadata: {
        name: secretName,
        namespace,
        labels: {
          app: 'shadowob-cloud',
          agent: agentName,
        },
      },
      type: 'Opaque',
      stringData: runtimePackage.secretData,
    },
    { provider, ...resourceOptions },
  )

  return { configMapName, secretName, configMap, secret }
}
