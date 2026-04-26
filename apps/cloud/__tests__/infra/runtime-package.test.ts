import { describe, expect, it } from 'vitest'
import type { CloudConfig } from '../../src/config/schema.js'
import { buildManifests } from '../../src/infra/index.js'
import { buildAgentRuntimePackage } from '../../src/infra/runtime-package.js'

describe('buildAgentRuntimePackage', () => {
  it('splits config files, plain env, and secrets consistently', () => {
    const config: CloudConfig = {
      version: '1',
      registry: {
        vaults: {
          default: {
            providers: {
              anthropic: { apiKey: 'sk-vault-provider' },
            },
            secrets: {
              EXTERNAL_SERVICE_TOKEN: 'vault-token',
            },
          },
        },
      },
      deployments: {
        agents: [
          {
            id: 'agent-1',
            runtime: 'openclaw',
            identity: {
              systemPrompt: 'Hello from the agent.',
            },
            env: {
              PUBLIC_FLAG: '1',
              SHADOW_SERVER_URL: 'http://shadow.local',
              INTERNAL_SECRET: 'top-secret',
            },
            configuration: {},
          },
        ],
      },
    }

    const runtimePackage = buildAgentRuntimePackage({
      agent: config.deployments!.agents[0]!,
      config,
    })

    expect(runtimePackage.configData['config.json']).toContain('"agent-1"')
    expect(runtimePackage.configData['SOUL.md']).toContain('Hello from the agent.')
    expect(runtimePackage.configData.PUBLIC_FLAG).toBeUndefined()

    expect(runtimePackage.plainEnv).toEqual({
      PUBLIC_FLAG: '1',
      SHADOW_SERVER_URL: 'http://shadow.local',
    })

    expect(runtimePackage.secretData).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-vault-provider',
      ANTHROPIC_APIKEY: 'sk-vault-provider',
      EXTERNAL_SERVICE_TOKEN: 'vault-token',
      INTERNAL_SECRET: 'top-secret',
    })
  })
})

describe('buildManifests', () => {
  it('keeps plain env on the Deployment and secrets in the Secret manifest', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        agents: [
          {
            id: 'agent-1',
            runtime: 'openclaw',
            env: {
              PUBLIC_FLAG: '1',
              INTERNAL_SECRET: 'top-secret',
            },
            configuration: {},
          },
        ],
      },
    }

    const manifests = buildManifests({ config, namespace: 'test-runtime-package' })
    const configMap = manifests.find(
      (manifest) => manifest.kind === 'ConfigMap' && manifest.metadata?.name === 'agent-1-config',
    )!
    const secret = manifests.find(
      (manifest) => manifest.kind === 'Secret' && manifest.metadata?.name === 'agent-1-secrets',
    )!
    const deployment = manifests.find(
      (manifest) => manifest.kind === 'Deployment' && manifest.metadata?.name === 'agent-1',
    )!

    expect(configMap.data.PUBLIC_FLAG).toBeUndefined()
    expect(secret.stringData.INTERNAL_SECRET).toBe('top-secret')

    const container = deployment.spec.template.spec.containers[0]
    expect(container.env).toEqual(expect.arrayContaining([{ name: 'PUBLIC_FLAG', value: '1' }]))
    expect(container.env).not.toEqual(
      expect.arrayContaining([{ name: 'INTERNAL_SECRET', value: 'top-secret' }]),
    )
    expect(container.envFrom).toEqual(
      expect.arrayContaining([{ secretRef: { name: 'agent-1-secrets' } }]),
    )
  })
})
