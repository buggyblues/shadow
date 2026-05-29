import { beforeAll, describe, expect, it } from 'vitest'
import type { CloudConfig } from '../../src/config/schema.js'
import { buildManifests } from '../../src/infra/index.js'
import { buildAgentRuntimePackage } from '../../src/infra/runtime-package.js'
import { loadAllPlugins } from '../../src/plugins/loader.js'
import { getPluginRegistry, resetPluginRegistry } from '../../src/plugins/registry.js'

beforeAll(async () => {
  resetPluginRegistry()
  await loadAllPlugins(getPluginRegistry())
}, 30_000)

function buildDeploymentManifests(options: Parameters<typeof buildManifests>[0]) {
  return buildManifests({
    ...options,
    config: {
      ...options.config,
      deployments: options.config.deployments
        ? { ...options.config.deployments, backend: 'deployment' }
        : options.config.deployments,
    },
  })
}

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
    expect(runtimePackage.configData['IDENTITY.md']).toContain('- Name: agent-1')
    expect(runtimePackage.configData['SOUL.md']).toContain('Hello from the agent.')
    expect(runtimePackage.configData.PUBLIC_FLAG).toBeUndefined()

    expect(runtimePackage.plainEnv).toEqual({
      PUBLIC_FLAG: '1',
      SHADOW_SERVER_URL: 'http://shadow.local',
      SHADOW_SLASH_COMMANDS_PATH: '/etc/shadowob/slash-commands.json',
    })

    expect(runtimePackage.secretData).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-vault-provider',
      ANTHROPIC_APIKEY: 'sk-vault-provider',
      EXTERNAL_SERVICE_TOKEN: 'vault-token',
      INTERNAL_SECRET: 'top-secret',
    })
  })

  it('uses registry provider secrets while building OpenClaw model config', () => {
    const config: CloudConfig = {
      version: '1',
      use: [{ plugin: 'model-provider' }],
      registry: {
        vaults: {
          default: {
            providers: {
              anthropic: { apiKey: 'sk-vault-provider' },
            },
          },
        },
      },
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

    const runtimePackage = buildAgentRuntimePackage({
      agent: config.deployments!.agents[0]!,
      config,
    })
    const openclawConfig = JSON.parse(runtimePackage.configData['config.json']!)
    const serializedConfig = runtimePackage.configData['config.json']!

    expect(openclawConfig.models.providers.anthropic).toMatchObject({
      api: 'anthropic-messages',
      apiKey: '${env:ANTHROPIC_API_KEY}',
    })
    expect(openclawConfig.models.providers.anthropic).not.toHaveProperty('timeoutSeconds')
    expect(openclawConfig.models).not.toHaveProperty('pricing')
    expect(openclawConfig.agents.defaults.model.primary).toBe('anthropic/claude-sonnet-4-5')
    expect(serializedConfig).not.toContain('sk-vault-provider')
    expect(runtimePackage.plainEnv.ANTHROPIC_API_KEY).toBeUndefined()
    expect(runtimePackage.secretData).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-vault-provider',
      ANTHROPIC_APIKEY: 'sk-vault-provider',
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
    expect(openclawConfig.channels.shadowob.capabilities).toMatchObject({
      inlineButtons: 'all',
      interactive: true,
      forms: true,
    })
    expect(openclawConfig.channels.shadowob.accounts['bot-1'].capabilities).toMatchObject({
      inlineButtons: 'all',
      interactive: true,
      forms: true,
    })
    expect(runtimeExtensions.openclaw.manifestPatches[0].extensionId).toBe('shadowob')
    expect(runtimeExtensions.artifacts).toContainEqual({
      kind: 'shadow.slashCommands',
      path: '/agent-packs/.shadow/slash-commands.json',
      mediaType: 'application/json',
    })
  })

  it('includes Google Workspace credential files in runtime extensions', () => {
    const config: CloudConfig = {
      version: '1',
      use: [
        {
          plugin: 'google-workspace',
        },
      ],
      deployments: {
        agents: [
          {
            id: 'workspace-agent',
            runtime: 'openclaw',
            configuration: {},
          },
        ],
      },
    }

    const runtimePackage = buildAgentRuntimePackage({
      agent: config.deployments!.agents[0]!,
      config,
      extraEnv: {
        GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON: '{"installed":{}}',
      },
    })
    const runtimeExtensions = JSON.parse(runtimePackage.configData['runtime-extensions.json']!)

    expect(runtimeExtensions.runtimeDependencies).toContainEqual(
      expect.objectContaining({
        id: 'gws-cli',
        packages: ['@googleworkspace/cli'],
      }),
    )
    expect(runtimeExtensions.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'google-workspace-cli-skills',
        includePattern: 'gws-*',
      }),
    )
    expect(runtimeExtensions.credentialFiles).toContainEqual({
      envKey: 'GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON',
      path: '/home/shadow/.config/gws/credentials.json',
      mode: '0600',
    })
    expect(runtimeExtensions.credentialFiles).toContainEqual({
      envKey: 'GOOGLE_APPLICATION_CREDENTIALS_JSON',
      path: '/home/shadow/.config/gws/application-default-credentials.json',
      mode: '0600',
    })
    expect(runtimeExtensions.verificationChecks.map((check: { id: string }) => check.id)).toEqual(
      expect.arrayContaining(['google-workspace-auth', 'google-workspace-calendar-agenda']),
    )
    expect(runtimePackage.openclawConfig.skills?.entries?.['google-workspace']).toMatchObject({
      enabled: true,
      config: {
        services: ['gmail', 'calendar', 'drive', 'docs', 'sheets'],
        skillSources: ['/workspace/.agents/plugin-skills/google-workspace'],
      },
      env: {
        GOOGLE_WORKSPACE_SERVICES: 'gmail,calendar,drive,docs,sheets',
      },
    })
    expect(runtimePackage.openclawConfig.skills?.entries?.['google-workspace']).not.toHaveProperty(
      'services',
    )
    expect(runtimePackage.openclawConfig.skills?.entries?.['google-workspace']).not.toHaveProperty(
      'skillSources',
    )
    expect(runtimePackage.secretData.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON).toBe('{"installed":{}}')
    expect(runtimePackage.secretData.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE).toBe(
      '/home/shadow/.config/gws/credentials.json',
    )
  })

  it('writes Lark CLI app credentials to config files without raw lark env injection', () => {
    const config: CloudConfig = {
      version: '1',
      use: [{ plugin: 'lark' }],
      deployments: {
        agents: [
          {
            id: 'lark-agent',
            runtime: 'openclaw',
            configuration: {},
          },
        ],
      },
    }

    const runtimePackage = buildAgentRuntimePackage({
      agent: config.deployments!.agents[0]!,
      config,
      extraEnv: {
        LARKSUITE_CLI_APP_ID: 'cli_app',
        LARKSUITE_CLI_APP_SECRET: 'app_secret',
        LARKSUITE_CLI_BRAND: 'lark',
        LARKSUITE_CLI_DEFAULT_AS: 'bot',
        LARKSUITE_CLI_STRICT_MODE: 'bot',
        MEEGLE_HOST: 'project.feishu.cn',
        MEEGLE_USER_ACCESS_TOKEN: 'meegle-token',
      },
    })
    const runtimeExtensions = JSON.parse(runtimePackage.configData['runtime-extensions.json']!)
    const larkConfig = JSON.parse(runtimePackage.secretData.LARKSUITE_CLI_CREDENTIALS_JSON!)

    expect(runtimeExtensions.mcpServers).toBeUndefined()
    expect(runtimeExtensions.runtimeDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'lark-cli', packages: ['@larksuite/cli'] }),
        expect.objectContaining({ id: 'meegle', packages: ['@lark-project/meegle'] }),
      ]),
    )
    expect(runtimeExtensions.skillSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'lark-cli-skills', includePattern: 'lark-*' }),
        expect.objectContaining({ id: 'meegle-cli-skills', include: ['meegle'] }),
      ]),
    )
    expect(runtimeExtensions.credentialFiles).toContainEqual({
      envKey: 'LARKSUITE_CLI_CREDENTIALS_JSON',
      path: '/home/shadow/.lark-cli/openclaw/config.json',
      mode: '0600',
    })
    expect(larkConfig).toMatchObject({
      strictMode: 'bot',
      currentApp: 'shadow-cloud',
      apps: [
        {
          name: 'shadow-cloud',
          appId: 'cli_app',
          appSecret: 'app_secret',
          brand: 'lark',
          defaultAs: 'bot',
          strictMode: 'bot',
          users: [],
        },
      ],
    })
    expect(runtimePackage.plainEnv.LARKSUITE_CLI_CONFIG_DIR).toBe('/home/shadow/.lark-cli')
    expect(runtimePackage.plainEnv.LARKSUITE_CLI_APP_ID).toBeUndefined()
    expect(runtimePackage.secretData.LARKSUITE_CLI_APP_SECRET).toBeUndefined()
    expect(runtimePackage.plainEnv.LARKSUITE_CLI_BRAND).toBeUndefined()
    expect(runtimePackage.configData['config.json']).not.toContain('app_secret')
    expect(runtimePackage.plainEnv.MEEGLE_HOST).toBe('project.feishu.cn')
    expect(runtimePackage.secretData.MEEGLE_USER_ACCESS_TOKEN).toBe('meegle-token')
  })

  it('includes Lovart skill mounts and keeps credentials in secrets', () => {
    const config: CloudConfig = {
      version: '1',
      use: [
        {
          plugin: 'lovart',
        },
      ],
      deployments: {
        agents: [
          {
            id: 'lovart-agent',
            runtime: 'openclaw',
            configuration: {},
          },
        ],
      },
    }

    const runtimePackage = buildAgentRuntimePackage({
      agent: config.deployments!.agents[0]!,
      config,
      extraEnv: {
        LOVART_ACCESS_KEY: 'ak_test',
        LOVART_SECRET_KEY: 'sk_test',
      },
    })
    const runtimeExtensions = JSON.parse(runtimePackage.configData['runtime-extensions.json']!)

    expect(runtimeExtensions.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'lovart-openclaw-skill',
        url: 'https://github.com/lovartai/lovart-skill.git',
        include: ['lovart-skill'],
      }),
    )
    expect(runtimePackage.openclawConfig?.skills?.load?.extraDirs).toContain(
      '/workspace/.agents/plugin-skills/lovart',
    )
    expect(runtimePackage.openclawConfig?.skills?.entries?.['lovart-skill']).toMatchObject({
      enabled: true,
      env: {
        LOVART_ACCESS_KEY: '${env:LOVART_ACCESS_KEY}',
        LOVART_SECRET_KEY: '${env:LOVART_SECRET_KEY}',
      },
    })
    expect(runtimePackage.configData['config.json']).not.toContain('ak_test')
    expect(runtimePackage.configData['config.json']).not.toContain('sk_test')
    expect(runtimePackage.plainEnv.LOVART_ACCESS_KEY).toBeUndefined()
    expect(runtimePackage.plainEnv.LOVART_SECRET_KEY).toBeUndefined()
    expect(runtimePackage.secretData).toMatchObject({
      LOVART_ACCESS_KEY: 'ak_test',
      LOVART_SECRET_KEY: 'sk_test',
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

    const manifests = buildDeploymentManifests({ config, namespace: 'test-runtime-package' })
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
        { name: 'OPENCLAW_MODEL_PRICING_FETCH_TIMEOUT_MS', value: '2500' },
        { name: 'OPENCLAW_SKIP_STARTUP_MODEL_PREWARM', value: '1' },
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
      'shadowob.cloud/runner-image': 'ghcr.io/buggyblues/openclaw-runner:latest',
    })
    expect(container.imagePullPolicy).toBe('Always')
    expect(
      deployment.spec.template.metadata.annotations['shadowob.cloud/runtime-package-hash'],
    ).toMatch(/^[a-f0-9]{64}$/)
  })

  it('writes deployment runtime credentials into agent Secret manifests', () => {
    const config: CloudConfig = {
      version: '1',
      use: [{ plugin: 'google-workspace' }],
      deployments: {
        agents: [
          {
            id: 'workspace-agent',
            runtime: 'openclaw',
            configuration: {},
          },
        ],
      },
    }

    const manifests = buildDeploymentManifests({
      config,
      namespace: 'workspace-runtime-package',
      runtimeEnvVars: {
        GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON: '{"installed":{"client_id":"abc"}}',
      },
    })
    const configMap = manifests.find(
      (manifest) =>
        manifest.kind === 'ConfigMap' && manifest.metadata?.name === 'workspace-agent-config',
    )!
    const secret = manifests.find(
      (manifest) =>
        manifest.kind === 'Secret' && manifest.metadata?.name === 'workspace-agent-secrets',
    )!
    const deployment = manifests.find(
      (manifest) => manifest.kind === 'Deployment' && manifest.metadata?.name === 'workspace-agent',
    )!

    expect(secret.stringData.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON).toBe(
      '{"installed":{"client_id":"abc"}}',
    )
    expect(secret.stringData.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE).toBe(
      '/home/shadow/.config/gws/credentials.json',
    )
    expect(configMap.data['runtime-extensions.json']).toContain(
      '/home/shadow/.config/gws/credentials.json',
    )
    expect(deployment.spec.template.spec.containers[0].envFrom).toEqual(
      expect.arrayContaining([{ secretRef: { name: 'workspace-agent-secrets' } }]),
    )
  })

  it('writes deployment locale and timezone into OpenClaw config and pod env', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        agents: [
          {
            id: 'local-agent',
            runtime: 'openclaw',
            identity: {
              systemPrompt: 'Follow deployment context.',
            },
            configuration: {},
          },
        ],
      },
    }

    const manifests = buildDeploymentManifests({
      config,
      namespace: 'runtime-context',
      runtimeContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
      },
    })
    const configMap = manifests.find(
      (manifest) =>
        manifest.kind === 'ConfigMap' && manifest.metadata?.name === 'local-agent-config',
    )!
    const deployment = manifests.find(
      (manifest) => manifest.kind === 'Deployment' && manifest.metadata?.name === 'local-agent',
    )!
    const configData = configMap.data as Record<string, string>
    const openclawConfig = JSON.parse(configData['config.json']!)
    const env = (
      deployment.spec as {
        template: { spec: { containers: Array<{ env: Array<{ name: string; value: string }> }> } }
      }
    ).template.spec.containers[0]!.env

    expect(openclawConfig.agents.defaults).toMatchObject({
      userTimezone: 'Asia/Shanghai',
      envelopeTimezone: 'user',
      timeFormat: '24',
    })
    expect(configData['SOUL.md']).toContain('Default user locale: zh-CN')
    expect(configData['SOUL.md']).toContain('User timezone: Asia/Shanghai')
    expect(env).toEqual(expect.arrayContaining([{ name: 'TZ', value: 'Asia/Shanghai' }]))
  })

  it('pulls latest registry runner images and keeps immutable/local images cacheable', () => {
    const baseAgent = {
      id: 'agent-1',
      runtime: 'openclaw' as const,
      configuration: {},
    }
    const latest = buildDeploymentManifests({
      namespace: 'pull-policy-latest',
      config: {
        version: '1',
        deployments: {
          agents: [baseAgent],
        },
      },
    })
    const pinned = buildDeploymentManifests({
      namespace: 'pull-policy-pinned',
      config: {
        version: '1',
        deployments: {
          agents: [
            {
              ...baseAgent,
              image: 'ghcr.io/buggyblues/openclaw-runner:20260429-0911',
            },
          ],
        },
      },
    })
    const local = buildDeploymentManifests({
      namespace: 'pull-policy-local',
      config: {
        version: '1',
        deployments: {
          agents: [
            {
              ...baseAgent,
              image: 'shadowob/openclaw-runner:latest',
            },
          ],
        },
      },
    })
    const explicit = buildDeploymentManifests({
      namespace: 'pull-policy-explicit',
      imagePullPolicy: 'IfNotPresent',
      config: {
        version: '1',
        deployments: {
          agents: [baseAgent],
        },
      },
    })

    expect(
      latest.find((manifest) => manifest.kind === 'Deployment')!.spec.template.spec.containers[0]
        .imagePullPolicy,
    ).toBe('Always')
    expect(
      pinned.find((manifest) => manifest.kind === 'Deployment')!.spec.template.spec.containers[0]
        .imagePullPolicy,
    ).toBe('IfNotPresent')
    expect(
      local.find((manifest) => manifest.kind === 'Deployment')!.spec.template.spec.containers[0]
        .imagePullPolicy,
    ).toBe('IfNotPresent')
    expect(
      explicit.find((manifest) => manifest.kind === 'Deployment')!.spec.template.spec.containers[0]
        .imagePullPolicy,
    ).toBe('IfNotPresent')
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

    const first = buildDeploymentManifests({
      config: makeConfig('first-secret'),
      namespace: 'hash-a',
    })
    const second = buildDeploymentManifests({
      config: makeConfig('second-secret'),
      namespace: 'hash-b',
    })
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

    const manifests = buildDeploymentManifests({ config, namespace: 'test-runtime-package' })
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

  it('defaults new manifests to agent-sandbox resources with a persistent OpenClaw state PVC', () => {
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

    const manifests = buildManifests({ config, namespace: 'sandbox-runtime-package' })
    expect(manifests.some((manifest) => manifest.kind === 'Deployment')).toBe(false)

    const template = manifests.find(
      (manifest) =>
        manifest.kind === 'SandboxTemplate' && manifest.metadata?.name === 'agent-1-template',
    )!
    const claim = manifests.find(
      (manifest) => manifest.kind === 'SandboxClaim' && manifest.metadata?.name === 'agent-1',
    )!
    const podSpec = template.spec.podTemplate.spec
    const container = podSpec.containers[0]

    expect(template.apiVersion).toBe('extensions.agents.x-k8s.io/v1alpha1')
    expect(claim.apiVersion).toBe('extensions.agents.x-k8s.io/v1alpha1')
    expect(template.spec.volumeClaimTemplates[0]).toMatchObject({
      metadata: { name: 'shadow-runner-state' },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '5Gi' } },
      },
    })
    expect(podSpec.automountServiceAccountToken).toBe(false)
    expect(podSpec.runtimeClassName).toBe('gvisor')
    expect(podSpec.nodeSelector).toEqual({ 'shadowob.com/sandbox-ready': 'true' })
    expect(podSpec.volumes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'shadow-runner-state' })]),
    )
    expect(container.volumeMounts).toEqual(
      expect.arrayContaining([
        { name: 'shadow-runner-state', mountPath: '/home/shadow/.openclaw' },
      ]),
    )
    expect(container.env).toEqual(
      expect.arrayContaining([
        { name: 'OPENCLAW_STATE_DIR', value: '/home/shadow/.openclaw' },
        { name: 'OPENCLAW_DATA_DIR', value: '/home/shadow/.openclaw' },
      ]),
    )
    expect(claim.spec).toMatchObject({
      sandboxTemplateRef: { name: 'agent-1-template' },
      warmpool: 'none',
      lifecycle: { shutdownPolicy: 'Retain' },
    })
  })

  it('rejects multi-replica agents on the agent-sandbox backend', () => {
    const config: CloudConfig = {
      version: '1',
      deployments: {
        agents: [
          {
            id: 'agent-1',
            runtime: 'openclaw',
            replicas: 2,
            configuration: {},
          },
        ],
      },
    }

    expect(() => buildManifests({ config, namespace: 'sandbox-runtime-package' })).toThrow(
      /supports only 0 or 1 replica/,
    )
  })
})
