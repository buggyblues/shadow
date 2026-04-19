/**
 * Config Resources — Kubernetes ConfigMap and Secret via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import { buildOpenClawConfig } from '../config/parser.js'
import type { AgentDeployment, CloudConfig } from '../config/schema.js'
import { getPluginRegistry } from '../plugins/registry.js'

export interface ConfigResourcesOptions {
  agentName: string
  agent: AgentDeployment
  config: CloudConfig
  namespace: string | pulumi.Input<string>
  extraEnv?: Record<string, string>
  provider: k8s.Provider
}

export function createConfigResources(options: ConfigResourcesOptions) {
  const { agentName, agent, config, namespace, extraEnv, provider } = options

  const openclawConfig = buildOpenClawConfig(agent, config)

  // Extract workspace files (e.g. SOUL.md) before serializing config
  const workspaceFiles = (openclawConfig._workspaceFiles ?? {}) as Record<string, string>
  delete openclawConfig._workspaceFiles

  const configMapName = `${agentName}-config`
  const secretName = `${agentName}-secrets`

  // Collect secrets from plugin manifests + resolved plugin secrets
  const registry = getPluginRegistry()
  const secretData: Record<string, string> = {}
  const configData: Record<string, string> = {
    'config.json': JSON.stringify(openclawConfig, null, 2),
    ...workspaceFiles,
  }

  // Extract secrets from enabled plugins based on manifest auth fields
  const pluginsMap = (config.plugins ?? {}) as Record<string, Record<string, unknown>>
  for (const pluginDef of registry.getAll()) {
    const pluginId = pluginDef.manifest.id
    const pluginInstance = pluginsMap[pluginId]
    if (!pluginInstance?.enabled) continue

    // Collect resolved secret refs from plugin instance
    const pluginSecrets = (pluginInstance.secrets ?? {}) as Record<string, string>
    for (const [secretKey, secretRef] of Object.entries(pluginSecrets)) {
      // Resolve ${env:VAR} references
      const envMatch = secretRef.match(/^\$\{env:(\w+)\}$/)
      if (envMatch?.[1]) {
        const envVal = process.env[envMatch[1]]
        if (envVal) secretData[secretKey] = envVal
      } else {
        // Literal value — store as secret since manifest marks it sensitive
        secretData[secretKey] = secretRef
      }
    }
  }

  // Add provisioned env vars — sensitive keys go to Secret, rest to ConfigMap
  if (extraEnv) {
    for (const [key, value] of Object.entries(extraEnv)) {
      secretData[key] = value
    }
  }

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
      data: configData,
    },
    { provider },
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
      stringData: secretData,
    },
    { provider },
  )

  return { configMapName, secretName, configMap, secret }
}
