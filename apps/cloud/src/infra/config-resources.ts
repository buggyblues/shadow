/**
 * Config Resources — Kubernetes ConfigMap and Secret via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import { buildOpenClawConfig } from '../config/parser.js'
import type { AgentDeployment, CloudConfig } from '../config/schema.js'

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

  // Separate secrets from env vars
  const secretData: Record<string, string> = {}
  const configData: Record<string, string> = {
    'config.json': JSON.stringify(openclawConfig, null, 2),
    ...workspaceFiles,
  }

  // Extract API keys and tokens into secrets
  if (config.registry?.providers) {
    for (const provider of config.registry.providers) {
      if (provider.apiKey) {
        const envKey = `${(provider.id ?? 'custom').toUpperCase().replace(/-/g, '_')}_API_KEY`
        secretData[envKey] = provider.apiKey
      }
    }
  }

  // All provisioned env vars (tokens, URLs, credentials) go into the Secret
  // so they are injected as environment variables via envFrom.secretRef.
  // Only file content (config.json, SOUL.md, etc.) belongs in the ConfigMap.
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
