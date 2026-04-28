import { beforeAll, describe, expect, it } from 'vitest'
import type { CloudConfig } from '../../src/config/schema.js'
import { buildManifests } from '../../src/infra/index.js'
import { buildAgentRuntimePackage } from '../../src/infra/runtime-package.js'
import { loadAllPlugins } from '../../src/plugins/loader.js'
import { getPluginRegistry, resetPluginRegistry } from '../../src/plugins/registry.js'

beforeAll(async () => {
  resetPluginRegistry()
  await loadAllPlugins(getPluginRegistry())
})

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

  it('writes plugin runtime extensions outside openclaw.json', () => {
    const config: CloudConfig = {
      version: '1',
      use: [
        {
          plugin: 'shadowob',
          options: {
            buddies: [{ id: 'bot-1', name: 'Buddy' }],
            bindings: [{ agentId: 'agent-1', targetId: 'bot-1' }],
          },
        },
      ],
      deployments: {
        agents: [
          {
            id: 'agent-1',
            runtime: 'openclaw',
            use: [
              {
                plugin: 'agent-pack',
                options: {
                  packs: [{ id: 'gstack', url: 'https://github.com/garrytan/gstack' }],
                },
              },
            ],
            configuration: {},
          },
        ],
      },
    }

    const runtimePackage = buildAgentRuntimePackage({
      agent: config.deployments!.agents[0]!,
      config,
      extraEnv: { SHADOW_SERVER_URL: 'http://shadow.local' },
    })

    const openclawConfig = JSON.parse(runtimePackage.configData['config.json']!)
    const runtimeExtensions = JSON.parse(runtimePackage.configData['runtime-extensions.json']!)

    expect(openclawConfig.plugins.load.paths).toContain('/app/extensions/shadowob')
    expect(openclawConfig.channels.shadowob.accounts['bot-1']).toBeDefined()
    expect(runtimeExtensions.openclaw.manifestPatches[0].extensionId).toBe('shadowob')
    expect(runtimeExtensions.artifacts).toContainEqual({
      kind: 'shadow.slashCommands',
      path: '/agent-packs/.shadow/slash-commands.json',
      mediaType: 'application/json',
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
    expect(container.env).toEqual(
      expect.arrayContaining([
        { name: 'OPENCLAW_HEALTH_PORT', value: '3102' },
        { name: 'OPENCLAW_GATEWAY_PORT', value: '3101' },
      ]),
    )
    expect(container.env).not.toEqual(
      expect.arrayContaining([{ name: 'INTERNAL_SECRET', value: 'top-secret' }]),
    )
    expect(container.envFrom).toEqual(
      expect.arrayContaining([{ secretRef: { name: 'agent-1-secrets' } }]),
    )
    expect(container.ports).toEqual([{ containerPort: 3102, name: 'health' }])
    expect(container.startupProbe.httpGet).toMatchObject({ path: '/live', port: 3102 })
    expect(container.readinessProbe.httpGet).toMatchObject({ path: '/ready', port: 3102 })
    expect(deployment.spec.template.metadata.annotations).toMatchObject({
      'shadowob.cloud/runner-image': 'ghcr.io/shadowob/openclaw-runner:latest',
    })
    expect(
      deployment.spec.template.metadata.annotations['shadowob.cloud/runtime-package-hash'],
    ).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes the pod-template package hash when runtime config changes', () => {
    const makeConfig = (secret: string): CloudConfig => ({
      version: '1',
      deployments: {
        agents: [
          {
            id: 'agent-1',
            runtime: 'openclaw',
            env: {
              INTERNAL_SECRET: secret,
            },
            configuration: {},
          },
        ],
      },
    })

    const first = buildManifests({ config: makeConfig('first-secret'), namespace: 'hash-a' })
    const second = buildManifests({ config: makeConfig('second-secret'), namespace: 'hash-b' })
    const firstDeployment = first.find((manifest) => manifest.kind === 'Deployment')!
    const secondDeployment = second.find((manifest) => manifest.kind === 'Deployment')!

    expect(
      firstDeployment.spec.template.metadata.annotations['shadowob.cloud/runtime-package-hash'],
    ).not.toBe(
      secondDeployment.spec.template.metadata.annotations['shadowob.cloud/runtime-package-hash'],
    )
  })

  it('marks generated resources for repeatable Pulumi ownership and fast service creation', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        agents: [
          {
            id: 'agent-1',
            runtime: 'openclaw',
            configuration: {},
          },
        ],
      },
    }

    const manifests = buildManifests({ config, namespace: 'test-runtime-package' })
    const managedKinds = ['Namespace', 'ConfigMap', 'Secret', 'Deployment', 'Service']

    for (const kind of managedKinds) {
      const manifest = manifests.find((item) => item.kind === kind)!
      expect(manifest.metadata.annotations).toMatchObject({ 'pulumi.com/patchForce': 'true' })
    }

    const service = manifests.find((item) => item.kind === 'Service')!
    expect(service.metadata.annotations).toMatchObject({ 'pulumi.com/skipAwait': 'true' })
    expect(service.spec.ports).toEqual([
      { name: 'health', port: 3100, targetPort: 3102, protocol: 'TCP' },
    ])
  })
})
