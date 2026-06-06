/**
 * Plugin system tests — registry, loader, helpers, config-merger.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  collectRuntimeEnvFields,
  collectRuntimeEnvRefPolicy,
  collectRuntimeEnvRequirements,
} from '../../src/application/runtime-env-requirements.js'
import { extractRequiredEnvVars } from '../../src/application/template-env-refs.js'
import {
  collectPluginBuildEnvVars,
  collectPluginRuntimeExtensions,
} from '../../src/config/openclaw-builder.js'
import { collectPluginK8sArtifacts } from '../../src/infra/plugin-k8s.js'
import {
  mergePluginFragments,
  resolveAgentPluginConfig,
  resolvePluginSecrets,
} from '../../src/plugins/config-merger.js'
import {
  defineChannelPlugin,
  defineProviderPlugin,
  defineSkillPlugin,
} from '../../src/plugins/helpers.js'
import { loadAllPlugins, registerPlugin, validateManifest } from '../../src/plugins/loader.js'
import {
  createPluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
} from '../../src/plugins/registry.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../../src/plugins/types.js'

// ─── Test fixtures ─────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    description: 'A test plugin',
    version: '1.0.0',
    category: 'other',
    icon: 'test',
    auth: {
      type: 'api-key',
      fields: [
        { key: 'TEST_API_KEY', label: 'API Key', required: true, sensitive: true },
        { key: 'TEST_ORG', label: 'Org ID', required: false, sensitive: false },
      ],
    },
    capabilities: ['tool'],
    tags: ['test'],
    ...overrides,
  }
}

function makePlugin(manifest: PluginManifest): PluginDefinition {
  return defineSkillPlugin(manifest, { skills: { bundled: [manifest.id] } })
}

function makeBuildContext(overrides: Partial<PluginBuildContext> = {}): PluginBuildContext {
  return {
    agent: {
      id: 'agent-1',
      name: 'Test Agent',
      runtime: 'openclaw',
    } as PluginBuildContext['agent'],
    config: {
      namespace: 'test-ns',
      agents: [],
      use: [],
    } as unknown as PluginBuildContext['config'],
    secrets: { TEST_API_KEY: 'sk-test-123' },
    namespace: 'test-ns',
    agentConfig: {},
    pluginRegistry: createPluginRegistry(),
    cwd: process.cwd(),
    ...overrides,
  }
}

// ─── Registry ──────────────────────────────────────────────────────────────

describe('PluginRegistry', () => {
  beforeEach(() => resetPluginRegistry())

  it('should register and retrieve plugins', () => {
    const registry = createPluginRegistry()
    const plugin = makePlugin(makeManifest())
    registry.register(plugin)

    expect(registry.size).toBe(1)
    expect(registry.get('test-plugin')).toBe(plugin)
  })

  it('should return undefined for unknown plugins', () => {
    const registry = createPluginRegistry()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('should filter by category', () => {
    const registry = createPluginRegistry()
    registry.register(makePlugin(makeManifest({ id: 'p1', category: 'ai-provider' })))
    registry.register(makePlugin(makeManifest({ id: 'p2', category: 'devops' })))
    registry.register(makePlugin(makeManifest({ id: 'p3', category: 'ai-provider' })))

    expect(registry.getByCategory('ai-provider')).toHaveLength(2)
    expect(registry.getByCategory('devops')).toHaveLength(1)
    expect(registry.getByCategory('finance')).toHaveLength(0)
  })

  it('should filter by capability', () => {
    const registry = createPluginRegistry()
    registry.register(makePlugin(makeManifest({ id: 'p1', capabilities: ['channel', 'tool'] })))
    registry.register(makePlugin(makeManifest({ id: 'p2', capabilities: ['webhook'] })))

    expect(registry.getByCapability('channel')).toHaveLength(1)
    expect(registry.getByCapability('tool')).toHaveLength(1)
    expect(registry.getByCapability('webhook')).toHaveLength(1)
  })

  it('should search by name and description', () => {
    const registry = createPluginRegistry()
    registry.register(
      makePlugin(makeManifest({ id: 'slack', name: 'Slack', description: 'Messaging' })),
    )
    registry.register(
      makePlugin(makeManifest({ id: 'discord', name: 'Discord', description: 'Gaming chat' })),
    )

    expect(registry.search('slack')).toHaveLength(1)
    expect(registry.search('chat')).toHaveLength(1)
    expect(registry.search('xyz')).toHaveLength(0)
  })

  it('should provide singleton via getPluginRegistry', () => {
    const r1 = getPluginRegistry()
    const r2 = getPluginRegistry()
    expect(r1).toBe(r2)
  })
})

// ─── Manifest Validation ───────────────────────────────────────────────────

describe('validateManifest', () => {
  it('should accept valid manifest', () => {
    expect(validateManifest(makeManifest())).toBe(true)
  })

  it('should reject null', () => {
    expect(validateManifest(null)).toBe(false)
  })

  it('should reject missing id', () => {
    const m = { ...makeManifest(), id: undefined }
    expect(validateManifest(m)).toBe(false)
  })

  it('should reject non-array capabilities', () => {
    const m = { ...makeManifest(), capabilities: 'tool' }
    expect(validateManifest(m)).toBe(false)
  })

  it('should reject missing auth', () => {
    const m = { ...makeManifest(), auth: undefined }
    expect(validateManifest(m)).toBe(false)
  })
})

// ─── Loader ────────────────────────────────────────────────────────────────

describe('loadAllPlugins', () => {
  beforeEach(() => resetPluginRegistry())

  it('should load all built-in plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    expect(
      registry
        .getAll()
        .map((plugin) => plugin.manifest.id)
        .sort(),
    ).toEqual([
      'agent-browser',
      'agent-pack',
      'agentmemory',
      'airtable',
      'alipay',
      'amap',
      'atlassian',
      'baidu-appbuilder',
      'baidu-maps',
      'baidu-netdisk',
      'baidu-smartprogram',
      'browserbase',
      'canva',
      'claude-plugin',
      'cloudflare',
      'cnb',
      'coze',
      'dingtalk',
      'douyin-miniprogram',
      'figma',
      'firebase',
      'firecrawl',
      'flyai',
      'gitagent',
      'gitee',
      'github',
      'google-ads',
      'google-analytics',
      'google-workspace',
      'huawei-xiaoyi',
      'hubspot',
      'huggingface',
      'inference-ai-image-generation',
      'inference-sh',
      'klaviyo',
      'kuaidi100',
      'lark',
      'linear',
      'lovart',
      'meta-ads',
      'miclaw',
      'model-provider',
      'nature-skills',
      'notion',
      'oceanengine',
      'opencli',
      'paypal',
      'playwright',
      'posthog',
      'salesforce',
      'sentry',
      'seo-suite',
      'shadowob',
      'sherlock',
      'shopify',
      'skills',
      'stripe',
      'supabase',
      'taobao-aipaas',
      'tapd',
      'tencent-ads',
      'tencent-docs',
      'tencent-maps',
      'text-to-cad',
      'vercel',
      'webflow',
      'wechat-miniprogram-skyline',
      'wechat-pay',
      'wonda',
      'wordpress-woocommerce',
      'wps',
      'yuque',
    ])
  }, 30_000)

  it('should expose provider catalogs for selector plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    const catalogs = registry.getAll().flatMap((plugin) => plugin.providerCatalogs ?? [])
    expect(catalogs.map((catalog) => catalog.id)).toEqual(
      expect.arrayContaining(['anthropic', 'openai', 'gemini', 'deepseek', 'openrouter']),
    )
    expect(catalogs.find((catalog) => catalog.id === 'anthropic')?.envKeyAliases).toContain(
      'ANTHROPIC_AUTH_TOKEN',
    )
  })

  it('should have valid manifests for all plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    for (const plugin of registry.getAll()) {
      expect(plugin.manifest.id).toBeTruthy()
      expect(plugin.manifest.name).toBeTruthy()
      expect(plugin.manifest.version).toBe('1.0.0')
      expect(plugin.manifest.capabilities.length).toBeGreaterThan(0)
      expect(plugin.manifest.tags.length).toBeGreaterThan(0)
    }
  }, 30_000)

  it('should load business connectors as independent plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    const shopify = registry.get('shopify')
    const webflow = registry.get('webflow')
    const cloudflare = registry.get('cloudflare')

    expect(shopify?.manifest.capabilities).toEqual(expect.arrayContaining(['skill', 'cli', 'mcp']))
    expect(shopify?.skills?.entries?.map((entry) => entry.id)).toContain('shopify')
    expect(shopify?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'shopify-ai-toolkit-skills',
        url: 'https://github.com/Shopify/shopify-ai-toolkit.git',
      }),
    )
    expect(shopify?.k8s).toBeDefined()

    expect(webflow?.manifest.capabilities).toEqual(expect.arrayContaining(['skill', 'cli', 'mcp']))
    expect(webflow?.runtime?.skillSources?.map((source) => source.id)).toEqual(
      expect.arrayContaining([
        'webflow-site-skills',
        'webflow-cli-skills',
        'webflow-code-component-skills',
      ]),
    )
    expect(webflow?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@webflow/webflow-cli'] }),
    )
    expect(cloudflare?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({
        id: 'cloudflare-mcp',
        transport: 'streamable-http',
        url: 'https://mcp.cloudflare.com/mcp',
      }),
    )
    expect(cloudflare?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'cloudflare-agent-skills',
        url: 'https://github.com/cloudflare/skills.git',
      }),
    )
  }, 30_000)

  it('should load China app-layer connectors as independent plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    const lark = registry.get('lark')
    const dingtalk = registry.get('dingtalk')
    const yuque = registry.get('yuque')
    const amap = registry.get('amap')
    const baiduMaps = registry.get('baidu-maps')
    const flyai = registry.get('flyai')
    const skyline = registry.get('wechat-miniprogram-skyline')
    const gitee = registry.get('gitee')

    expect(lark?.manifest.capabilities).toEqual(expect.arrayContaining(['skill', 'cli']))
    expect(lark?.manifest.capabilities).not.toContain('mcp')
    expect(lark?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'lark-cli-skills',
        url: 'https://github.com/larksuite/cli.git',
      }),
    )
    expect(lark?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'meegle-cli-skills',
        url: 'https://github.com/larksuite/meegle-cli.git',
        include: ['meegle'],
      }),
    )
    expect(lark?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@larksuite/cli'] }),
    )
    expect(lark?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@lark-project/meegle'] }),
    )
    expect(lark?.runtime?.mcpServers).toBeUndefined()
    expect(lark?.runtime?.credentialFiles).toContainEqual({
      envKey: 'LARKSUITE_CLI_CREDENTIALS_JSON',
      path: '/home/shadow/.lark-cli/openclaw/config.json',
      mode: '0600',
    })

    expect(dingtalk?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({
        id: 'dingtalk-mcp',
        args: ['-y', 'dingtalk-mcp@latest'],
      }),
    )
    expect(yuque?.runtime?.skillSources?.map((source) => source.id)).toContain('yuque-agent-skills')
    expect(yuque?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({ id: 'yuque-mcp', args: ['-y', 'yuque-mcp@latest'] }),
    )
    expect(amap?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({
        id: 'amap-maps-mcp',
        args: ['-y', '@amap/amap-maps-mcp-server@latest'],
      }),
    )
    expect(baiduMaps?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({
        id: 'baidu-map-mcp',
        args: ['-y', '@baidumap/mcp-server-baidu-map@latest'],
      }),
    )
    expect(flyai?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'flyai-skills',
        url: 'https://github.com/alibaba-flyai/flyai-skill.git',
      }),
    )
    expect(skyline?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'wechat-skyline-skills',
        url: 'https://github.com/wechat-miniprogram/skyline-skills.git',
      }),
    )
    expect(gitee?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({
        id: 'gitee-mcp',
        args: ['-y', '@gitee/mcp-gitee@latest'],
      }),
    )
  }, 30_000)

  it('should load skills.sh connectors as independent plugins', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    const agentBrowser = registry.get('agent-browser')
    const skills = registry.get('skills')
    const textToCad = registry.get('text-to-cad')
    const natureSkills = registry.get('nature-skills')
    const opencli = registry.get('opencli')
    const inferenceSh = registry.get('inference-sh')
    const aiImage = registry.get('inference-ai-image-generation')
    const wonda = registry.get('wonda')

    expect(agentBrowser?.manifest.capabilities).toEqual(expect.arrayContaining(['skill', 'cli']))
    expect(agentBrowser?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['agent-browser'] }),
    )
    expect(agentBrowser?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'agent-browser-skill',
        url: 'https://github.com/vercel-labs/agent-browser.git',
      }),
    )

    expect(skills?.cli).toContainEqual(
      expect.objectContaining({
        name: 'skills',
        command: 'skills',
      }),
    )
    expect(skills?.runtime).toBeUndefined()
    expect(textToCad?.manifest.capabilities).toEqual(
      expect.arrayContaining(['skill', 'cli', 'tool']),
    )
    expect(textToCad?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'text-to-cad-skills',
        url: 'https://github.com/earthtojake/text-to-cad.git',
        from: 'skills',
      }),
    )
    expect(textToCad?.runtime?.runtimeDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'text-to-cad-python-prereqs',
          packages: expect.arrayContaining(['libgl1', 'libxrender1', 'libxext6', 'libsm6']),
        }),
        expect.objectContaining({ id: 'text-to-cad-python-packages', kind: 'shell' }),
        expect.objectContaining({ id: 'text-to-cad-python-compat', kind: 'shell' }),
        expect.objectContaining({
          id: 'text-to-cad-viewer-deps',
          kind: 'shell',
          phase: 'post-source',
        }),
        expect.objectContaining({
          id: 'text-to-cad-skill-compat',
          kind: 'shell',
          phase: 'post-source',
        }),
      ]),
    )
    expect(textToCad?.runtime?.verificationChecks).toContainEqual(
      expect.objectContaining({
        id: 'text-to-cad-skills-mounted',
        command: ['test', '-f', '/workspace/.agents/plugin-skills/text-to-cad/cad/SKILL.md'],
      }),
    )
    expect(
      textToCad?.k8s?.buildK8s(
        {
          id: 'agent-1',
          runtime: 'openclaw',
          use: [{ plugin: 'text-to-cad' }],
          configuration: {},
        },
        {
          agent: {
            id: 'agent-1',
            runtime: 'openclaw',
            configuration: {},
          },
          config: { version: '1' },
          namespace: 'default',
        },
      )?.initContainers?.[0]?.image,
    ).toBe('node:22-bookworm-slim')
    expect(natureSkills?.manifest.capabilities).toEqual(
      expect.arrayContaining(['skill', 'mcp', 'tool']),
    )
    expect(natureSkills?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'nature-skills',
        url: 'https://github.com/Yuan1z0825/nature-skills.git',
        includePattern: 'nature-*',
      }),
    )
    expect(natureSkills?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({
        id: 'nature-academic-search',
        command: 'python3',
        args: [
          '/workspace/.agents/plugin-skills/nature-skills/nature-academic-search/mcp-server/academic_search_server.py',
        ],
      }),
    )

    expect(opencli?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@jackwener/opencli'] }),
    )
    expect(opencli?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'opencli-skills',
        url: 'https://github.com/jackwener/opencli.git',
      }),
    )
    expect(opencli?.runtime?.verificationChecks).toContainEqual(
      expect.objectContaining({
        id: 'opencli-cli-installed',
        command: ['opencli', '--version'],
      }),
    )

    expect(inferenceSh?.runtime?.runtimeDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'inference-cli-prereqs', kind: 'system-package' }),
        expect.objectContaining({ id: 'inference-cli', kind: 'shell' }),
      ]),
    )
    expect(inferenceSh?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'infsh-cli-skill',
        url: 'https://github.com/infsh-skills/skills.git',
      }),
    )
    expect(aiImage?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'infsh-ai-image-skills',
        from: 'tools/image',
      }),
    )
    expect(wonda?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@degausai/wonda'] }),
    )
    expect(wonda?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'wonda-cli-skill',
        url: 'https://github.com/degausai/wonda.git',
      }),
    )
  }, 30_000)

  it('should mount configured skills only for agents using the skills plugin', async () => {
    resetPluginRegistry()
    const registry = getPluginRegistry()
    await loadAllPlugins(registry)

    const agent = {
      id: 'worker',
      runtime: 'hermes',
      use: [
        {
          plugin: 'skills',
          options: {
            install: [
              {
                package: 'example-org/research-skills',
                skills: ['research-brief', 'source-check'],
              },
              {
                package: 'example-org/delivery-skills',
                skills: ['delivery-check'],
              },
            ],
          },
        },
      ],
    } as PluginBuildContext['agent']
    const config = {
      namespace: 'test-ns',
      use: [],
      agents: [],
    } as unknown as PluginBuildContext['config']

    const runtime = collectPluginRuntimeExtensions(agent, config)
    expect(runtime.skillSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://github.com/example-org/research-skills.git',
          include: ['research-brief', 'source-check'],
        }),
        expect.objectContaining({
          url: 'https://github.com/example-org/delivery-skills.git',
          include: ['delivery-check'],
        }),
      ]),
    )

    const artifacts = collectPluginK8sArtifacts(agent, config, 'test-ns')
    const installScript = artifacts.initContainers
      .flatMap((container) => container.command ?? [])
      .join('\n')
    expect(installScript).toContain('https://github.com/example-org/research-skills.git')
    expect(installScript).toContain('https://github.com/example-org/delivery-skills.git')
  }, 30_000)

  it('should keep skills plugin runtime assets scoped to agent use', async () => {
    resetPluginRegistry()
    const registry = getPluginRegistry()
    await loadAllPlugins(registry)

    const agent = {
      id: 'agent-without-skills',
      runtime: 'openclaw',
      use: [],
    } as PluginBuildContext['agent']
    const config = {
      namespace: 'test-ns',
      use: [
        {
          plugin: 'skills',
          options: {
            install: [{ package: 'example-org/delivery-skills', skills: ['delivery-check'] }],
          },
        },
      ],
      agents: [],
    } as unknown as PluginBuildContext['config']

    const runtime = collectPluginRuntimeExtensions(agent, config)
    expect(runtime.runtimeDependencies).toBeUndefined()
    expect(runtime.skillSources).toBeUndefined()

    const artifacts = collectPluginK8sArtifacts(agent, config, 'test-ns')
    expect(artifacts.initContainers).toHaveLength(0)
    expect(artifacts.volumeMounts).toHaveLength(0)

    const skillsPlugin = registry.get('skills')
    const validationErrors =
      skillsPlugin?._hooks.validate.flatMap((fn) => {
        const result = fn(
          makeBuildContext({
            agent,
            config,
            agentConfig: {},
            pluginRegistry: registry,
          }),
        )
        return result?.errors ?? []
      }) ?? []
    expect(validationErrors).toContainEqual(
      expect.objectContaining({
        path: 'use',
        severity: 'error',
      }),
    )
  }, 30_000)

  it('should not mount default community skills when only the skills plugin is enabled', async () => {
    resetPluginRegistry()
    const registry = getPluginRegistry()
    await loadAllPlugins(registry)

    const agent = {
      id: 'agent-with-skills-cli',
      runtime: 'openclaw',
      use: [{ plugin: 'skills' }],
    } as PluginBuildContext['agent']
    const config = {
      namespace: 'test-ns',
      use: [],
      agents: [],
    } as unknown as PluginBuildContext['config']

    const runtime = collectPluginRuntimeExtensions(agent, config)
    expect(runtime.runtimeDependencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'skills', packages: ['skills'] })]),
    )
    expect(runtime.skillSources).toBeUndefined()

    const skillsPlugin = registry.get('skills')
    const fragment = skillsPlugin?._hooks.buildConfig[0]?.(
      makeBuildContext({
        agent,
        config,
        agentConfig: {},
        pluginRegistry: registry,
      }),
    )
    expect(fragment).toBeUndefined()

    const artifacts = collectPluginK8sArtifacts(agent, config, 'test-ns')
    expect(artifacts.initContainers).toHaveLength(1)
    expect(
      artifacts.initContainers.flatMap((container) => container.volumeMounts ?? []),
    ).not.toContainEqual(expect.objectContaining({ mountPath: '/plugin-skills' }))
  }, 30_000)

  it('should load AgentMemory as an MCP-backed memory plugin', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    const agentmemory = registry.get('agentmemory')

    expect(agentmemory?.manifest.capabilities).toEqual(
      expect.arrayContaining(['tool', 'data-source', 'cli', 'mcp']),
    )
    expect(agentmemory?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({
        packages: ['@agentmemory/agentmemory@latest', '@agentmemory/mcp@latest'],
      }),
    )
    expect(agentmemory?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({
        id: 'agentmemory',
        command: 'npx',
        args: ['-y', '@agentmemory/mcp@latest'],
      }),
    )
  }, 30_000)

  it('should load design, product, and browser operations connectors', async () => {
    const registry = createPluginRegistry()
    await loadAllPlugins(registry)

    const figma = registry.get('figma')
    const canva = registry.get('canva')
    const airtable = registry.get('airtable')
    const huggingface = registry.get('huggingface')
    const sentry = registry.get('sentry')
    const firebase = registry.get('firebase')
    const firecrawl = registry.get('firecrawl')
    const playwright = registry.get('playwright')
    const browserbase = registry.get('browserbase')
    const linear = registry.get('linear')
    const lovart = registry.get('lovart')
    const atlassian = registry.get('atlassian')
    const posthog = registry.get('posthog')
    const supabase = registry.get('supabase')
    const sherlock = registry.get('sherlock')

    expect(figma?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@figma/code-connect'] }),
    )
    expect(figma?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'figma-mcp-skills',
        url: 'https://github.com/figma/mcp-server-guide.git',
      }),
    )
    expect(canva?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@canva/cli'] }),
    )
    expect(airtable?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'airtable-skills',
        url: 'https://github.com/Airtable/skills.git',
      }),
    )
    expect(airtable?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({ id: 'airtable-mcp', url: 'https://mcp.airtable.com/mcp' }),
    )
    expect(huggingface?.runtime?.runtimeDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'hf-cli-prereqs', kind: 'system-package' }),
        expect.objectContaining({ id: 'hf-cli', kind: 'shell' }),
      ]),
    )
    expect(huggingface?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'huggingface-skills',
        url: 'https://github.com/huggingface/skills.git',
      }),
    )
    expect(sentry?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@sentry/cli'] }),
    )
    expect(sentry?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'sentry-agent-skills',
        url: 'https://github.com/getsentry/agent-skills.git',
      }),
    )
    expect(firebase?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'firebase-agent-skills',
        url: 'https://github.com/firebase/agent-skills.git',
      }),
    )
    expect(firecrawl?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['firecrawl-cli', 'firecrawl-mcp'] }),
    )
    expect(playwright?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['playwright', '@playwright/mcp'] }),
    )
    expect(browserbase?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['@browserbasehq/mcp-server-browserbase'] }),
    )
    expect(linear?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({ id: 'linear-mcp', url: 'https://mcp.linear.app/sse' }),
    )
    expect(lovart?.secretFields?.map((field) => field.key)).toEqual(
      expect.arrayContaining(['LOVART_ACCESS_KEY', 'LOVART_SECRET_KEY']),
    )
    expect(lovart?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'lovart-openclaw-skill',
        url: 'https://github.com/lovartai/lovart-skill.git',
        from: 'skills',
        include: ['lovart-skill'],
      }),
    )
    expect(lovart?.runtime?.verificationChecks).toContainEqual(
      expect.objectContaining({
        id: 'lovart-skill-mounted',
        command: ['test', '-f', '/workspace/.agents/plugin-skills/lovart/lovart-skill/SKILL.md'],
      }),
    )
    expect(atlassian?.runtime?.mcpServers).toContainEqual(
      expect.objectContaining({ id: 'atlassian-mcp', url: 'https://mcp.atlassian.com/v1/sse' }),
    )
    expect(posthog?.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({ packages: ['posthog-cli'] }),
    )
    expect(supabase?.runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'supabase-agent-skills',
        url: 'https://github.com/supabase/agent-skills.git',
      }),
    )
    expect(sherlock?.runtime?.runtimeDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sherlock-python-prereqs', kind: 'system-package' }),
        expect.objectContaining({ id: 'sherlock', kind: 'shell' }),
      ]),
    )
    expect(sherlock?.runtime?.verificationChecks).toContainEqual(
      expect.objectContaining({
        id: 'sherlock-cli-installed',
        command: ['sherlock', '--version'],
      }),
    )
  }, 30_000)
})

// ─── defineSkillPlugin ─────────────────────────────────────────────────────

describe('defineSkillPlugin', () => {
  it('should create a valid plugin definition', () => {
    const plugin = makePlugin(makeManifest())
    expect(plugin.manifest.id).toBe('test-plugin')
    expect(plugin._hooks.buildConfig.length).toBeGreaterThan(0)
    expect(plugin._hooks.buildEnv.length).toBeGreaterThan(0)
    expect(plugin._hooks.validate.length).toBeGreaterThan(0)
  })

  it('should generate OpenClaw config with skills', () => {
    const plugin = makePlugin(makeManifest())
    const ctx = makeBuildContext()
    const fragment = plugin._hooks.buildConfig[0]!(ctx)

    expect(fragment?.skills).toBeDefined()
    const skills = fragment?.skills as Record<string, unknown>
    expect(skills.allowBundled).toEqual(['test-plugin'])
  })

  it('should build env vars from secrets', () => {
    const plugin = makePlugin(makeManifest())
    const ctx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-123', TEST_ORG: 'org-1' } })
    const envVars = plugin._hooks.buildEnv[0]!(ctx)

    expect(envVars?.TEST_API_KEY).toBe('sk-123')
  })

  it('should validate required secrets', () => {
    const plugin = makePlugin(makeManifest())

    const validCtx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-123' } })
    expect(plugin._hooks.validate[0]!(validCtx)?.valid).toBe(true)

    const invalidCtx = makeBuildContext({ secrets: {} })
    const result = plugin._hooks.validate[0]!(invalidCtx)!
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].path).toBe('secrets.TEST_API_KEY')
  })

  it('should expose connector runtime assets through the plugin API', () => {
    const plugin = defineSkillPlugin(
      makeManifest(),
      { cli: [{ name: 'demo', command: 'demo', description: 'Demo CLI' }] },
      (api) => {
        api.addRuntimeDependencies([{ id: 'demo-cli', kind: 'npm-global', packages: ['demo-cli'] }])
        api.addSkillSources([
          {
            id: 'demo-skills',
            kind: 'git',
            url: 'https://example.com/demo.git',
            targetPath: '/workspace/.agents/plugin-skills/demo',
          },
        ])
        api.addSubagentSources([
          {
            id: 'demo-subagents',
            kind: 'git',
            url: 'https://example.com/demo-subagents.git',
            targetPath: '/workspace/.agents/plugin-subagents/demo',
          },
        ])
        api.addMCP({
          id: 'demo-mcp',
          transport: 'stdio',
          command: 'demo-mcp',
        })
        api.addCredentialFiles([{ envKey: 'DEMO_JSON', path: '/home/shadow/.config/demo.json' }])
        api.addVerificationChecks([
          {
            id: 'demo-auth',
            label: 'Demo auth',
            kind: 'command',
            command: ['demo', 'auth', 'status'],
            requiredEnvAny: ['DEMO_TOKEN', 'DEMO_JSON'],
          },
        ])
      },
    )

    const runtime = plugin._hooks.buildRuntime[0]?.(makeBuildContext())
    expect(runtime).toMatchObject({
      runtimeDependencies: [{ id: 'demo-cli', kind: 'npm-global', packages: ['demo-cli'] }],
      skillSources: [{ id: 'demo-skills', targetPath: '/workspace/.agents/plugin-skills/demo' }],
      subagentSources: [
        { id: 'demo-subagents', targetPath: '/workspace/.agents/plugin-subagents/demo' },
      ],
      mcpServers: [{ id: 'demo-mcp', transport: 'stdio', command: 'demo-mcp' }],
      credentialFiles: [{ envKey: 'DEMO_JSON', path: '/home/shadow/.config/demo.json' }],
      verificationChecks: [
        {
          id: 'demo-auth',
          requiredEnvAny: ['DEMO_TOKEN', 'DEMO_JSON'],
        },
      ],
    })
    expect(plugin.mcp).toContainEqual({
      id: 'demo-mcp',
      transport: 'stdio',
      command: 'demo-mcp',
    })
  })

  it('should merge path-like build env vars from multiple enabled plugins', () => {
    resetPluginRegistry()
    const registry = getPluginRegistry()
    registry.register(
      defineSkillPlugin(makeManifest({ id: 'python-plugin-1' }), {}, (api) => {
        api.onBuildEnv(() => ({ PYTHONPATH: '/opt/plugin-1/python' }))
      }),
    )
    registry.register(
      defineSkillPlugin(makeManifest({ id: 'python-plugin-2' }), {}, (api) => {
        api.onBuildEnv(() => ({ PYTHONPATH: '/opt/plugin-2/python' }))
      }),
    )

    const env = collectPluginBuildEnvVars(
      {
        id: 'agent-1',
        name: 'Test Agent',
        runtime: 'openclaw',
        use: [{ plugin: 'python-plugin-1' }, { plugin: 'python-plugin-2' }],
      } as PluginBuildContext['agent'],
      {
        namespace: 'test-ns',
        agents: [],
        use: [],
      } as unknown as PluginBuildContext['config'],
    )

    expect(env.PYTHONPATH).toBe('/opt/plugin-1/python:/opt/plugin-2/python')
  })

  it('should merge plugin PATH env vars without hiding earlier plugin binaries', () => {
    resetPluginRegistry()
    const registry = getPluginRegistry()
    const defaultPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    const plugin1 = makePlugin(makeManifest({ id: 'runtime-plugin-1' }))
    const plugin2 = makePlugin(makeManifest({ id: 'runtime-plugin-2' }))
    plugin1.k8s = {
      buildK8s: () => ({
        envVars: [{ name: 'PATH', value: `/opt/plugin-1/bin:${defaultPath}` }],
      }),
    }
    plugin2.k8s = {
      buildK8s: () => ({
        envVars: [{ name: 'PATH', value: `/opt/plugin-2/bin:${defaultPath}` }],
      }),
    }
    registry.register(plugin1)
    registry.register(plugin2)

    const artifacts = collectPluginK8sArtifacts(
      {
        id: 'agent-1',
        name: 'Test Agent',
        runtime: 'openclaw',
        use: [{ plugin: 'runtime-plugin-1' }, { plugin: 'runtime-plugin-2' }],
      } as PluginBuildContext['agent'],
      {
        namespace: 'test-ns',
        agents: [],
        use: [],
      } as unknown as PluginBuildContext['config'],
      'test-ns',
    )

    expect(artifacts.envVars.find((env) => env.name === 'PATH')?.value).toBe(
      `/opt/plugin-1/bin:/opt/plugin-2/bin:${defaultPath}`,
    )
  })
})

// ─── defineChannelPlugin ───────────────────────────────────────────────────

describe('defineChannelPlugin', () => {
  it('should use custom channel builder for config', () => {
    const channelBuilder = (ctx: PluginBuildContext): PluginConfigFragment => ({
      channels: {
        'test-channel': { enabled: true, accounts: { [ctx.agent.id]: { token: 'tok' } } },
      },
      bindings: [{ agentId: ctx.agent.id, type: 'route', match: { channel: 'test-channel' } }],
    })

    const plugin = defineChannelPlugin(makeManifest({ capabilities: ['channel'] }), channelBuilder)
    const ctx = makeBuildContext()
    const fragment = plugin._hooks.buildConfig[0]!(ctx)

    expect(fragment?.channels).toBeDefined()
    expect(fragment?.bindings).toHaveLength(1)
  })

  it('should still provide env vars and validation', () => {
    const channelBuilder = () => ({})
    const plugin = defineChannelPlugin(makeManifest(), channelBuilder)
    const ctx = makeBuildContext({ secrets: { TEST_API_KEY: 'sk-x' } })

    expect(plugin._hooks.buildEnv[0]!(ctx)).toEqual({ TEST_API_KEY: 'sk-x' })
    expect(plugin._hooks.validate[0]!(ctx)?.valid).toBe(true)
  })
})

// ─── defineProviderPlugin ──────────────────────────────────────────────────

describe('defineProviderPlugin', () => {
  it('declares provider catalogs and secret fields through PluginAPI', () => {
    const plugin = defineProviderPlugin(makeManifest({ id: 'provider-x' }), {
      provider: {
        id: 'provider-x',
        api: 'openai',
        baseUrl: 'https://provider.example/v1',
        envKeyAliases: ['PROVIDER_X_TOKEN'],
        models: [{ id: 'model-a', tags: ['default'] }],
      },
    })

    expect(plugin.providerCatalogs?.[0]).toMatchObject({
      id: 'provider-x',
      api: 'openai-completions',
      envKey: 'TEST_API_KEY',
      envKeyAliases: ['PROVIDER_X_TOKEN'],
    })
    expect(plugin.secretFields?.map((field) => field.key)).toContain('TEST_API_KEY')
  })
})

// ─── Config Merger ─────────────────────────────────────────────────────────

describe('mergePluginFragments', () => {
  it('should deep merge channels', () => {
    const base: PluginConfigFragment = {
      channels: { slack: { accounts: { a1: { token: 'tok1' } } } },
    }
    const fragment: PluginConfigFragment = {
      channels: { discord: { accounts: { a2: { token: 'tok2' } } } },
    }
    const result = mergePluginFragments(base as any, fragment)

    expect(result.channels).toHaveProperty('slack')
    expect(result.channels).toHaveProperty('discord')
  })

  it('should append bindings arrays', () => {
    const base: PluginConfigFragment = {
      bindings: [{ agentId: 'a1', type: 'route' }],
    }
    const fragment: PluginConfigFragment = {
      bindings: [{ agentId: 'a2', type: 'route' }],
    }
    const result = mergePluginFragments(base as any, fragment)

    expect(result.bindings).toHaveLength(2)
  })

  it('should deep merge plugins section', () => {
    const base: PluginConfigFragment = {
      plugins: { entries: { 'plugin-1': { enabled: true } } },
    }
    const fragment: PluginConfigFragment = {
      plugins: { entries: { 'plugin-2': { enabled: true } } },
    }
    const result = mergePluginFragments(base as any, fragment)

    const entries = (result.plugins as Record<string, Record<string, unknown>>).entries
    expect(entries['plugin-1']).toBeDefined()
    expect(entries['plugin-2']).toBeDefined()
  })

  it('should merge plugin load paths without overwriting earlier plugins', () => {
    const base: PluginConfigFragment = {
      plugins: { load: { paths: ['/app/extensions/a'] } },
    }
    const fragment: PluginConfigFragment = {
      plugins: { load: { paths: ['/app/extensions/b', '/app/extensions/a'] } },
    }
    const result = mergePluginFragments(base as any, fragment)

    expect(result.plugins?.load?.paths).toEqual(['/app/extensions/a', '/app/extensions/b'])
  })
})

describe('resolveAgentPluginConfig', () => {
  it('should return null for unconfigured plugins', () => {
    const config = { version: '1' } as unknown as PluginBuildContext['config']
    expect(resolveAgentPluginConfig('test-plugin', 'agent-1', config)).toBeNull()
  })

  it('should return null when plugin not configured', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'other-plugin', options: { x: 1 } }],
    } as unknown as PluginBuildContext['config']
    expect(resolveAgentPluginConfig('test-plugin', 'agent-1', config)).toBeNull()
  })

  it('should resolve from global plugin config', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin', options: { globalOpt: 'a' } }],
    } as unknown as PluginBuildContext['config']

    const resolved = resolveAgentPluginConfig('test-plugin', 'agent-1', config)
    expect(resolved).toEqual({ globalOpt: 'a' })
  })

  it('should prefer agent-level config over global config', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin', options: { globalOpt: 'a', sharedOpt: 'global' } }],
    } as unknown as PluginBuildContext['config']

    const resolved = resolveAgentPluginConfig('test-plugin', 'agent-1', config)
    expect(resolved).toBeDefined()
    expect(resolved).toEqual({ globalOpt: 'a', sharedOpt: 'global' })
  })

  it('should return empty config when plugin has no options', () => {
    const config = {
      version: '1',
      use: [{ plugin: 'test-plugin' }],
    } as unknown as PluginBuildContext['config']

    const resolved = resolveAgentPluginConfig('test-plugin', 'agent-1', config)
    expect(resolved).toEqual({})
  })
})

describe('resolvePluginSecrets', () => {
  it('should resolve ${env:VAR} from process env', () => {
    const config = {
      version: '1',
      use: [
        {
          plugin: 'test-plugin',
          options: { TEST_API_KEY: '${env:MY_KEY}' },
        },
      ],
    } as unknown as PluginBuildContext['config']

    const secrets = resolvePluginSecrets('test-plugin', config, { MY_KEY: 'resolved-value' })
    expect(secrets.TEST_API_KEY).toBe('resolved-value')
  })

  it('should pass through literal values', () => {
    const config = {
      version: '1',
      use: [
        {
          plugin: 'test-plugin',
          options: { TEST_API_KEY: 'literal-key' },
        },
      ],
    } as unknown as PluginBuildContext['config']

    const secrets = resolvePluginSecrets('test-plugin', config, {})
    expect(secrets.TEST_API_KEY).toBe('literal-key')
  })

  it('should return empty for missing plugin config', () => {
    const config = { version: '1' } as unknown as PluginBuildContext['config']
    expect(resolvePluginSecrets('test-plugin', config, {})).toEqual({})
  })
})

describe('collectRuntimeEnvRequirements', () => {
  beforeEach(() => resetPluginRegistry())

  it('collects model-provider env keys from provider plugin catalogs', async () => {
    const keys = await collectRuntimeEnvRequirements({
      version: '1',
      use: [{ plugin: 'model-provider' }],
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw', configuration: {} }] },
    })

    expect(keys).toEqual(
      expect.arrayContaining([
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'OPENAI_API_KEY',
        'DEEPSEEK_API_KEY',
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
        'GOOGLE_AI_API_KEY',
        'XAI_API_KEY',
        'GROK_API_KEY',
        'OPENAI_COMPATIBLE_BASE_URL',
        'OPENAI_COMPATIBLE_API_KEY',
        'OPENAI_COMPATIBLE_MODEL_ID',
      ]),
    )
  })

  it('collects connector credential keys without template env wiring', async () => {
    const keys = await collectRuntimeEnvRequirements({
      version: '1',
      use: [{ plugin: 'google-workspace' }],
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw', configuration: {} }] },
    })

    expect(keys).toEqual(expect.arrayContaining(['GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON']))
    expect(keys).toContain('GOOGLE_WORKSPACE_ADC_JSON')
    expect(keys).toContain('GOOGLE_WORKSPACE_CREDENTIALS_JSON')
    expect(keys).toContain('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    expect(keys).not.toContain('GOOGLE_WORKSPACE_ACCESS_TOKEN')
    expect(keys).not.toContain('GOOGLE_WORKSPACE_CLI_TOKEN')
  })

  it('collects connector credential field metadata for deploy forms', async () => {
    const fields = await collectRuntimeEnvFields({
      version: '1',
      use: [{ plugin: 'google-workspace' }],
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw', configuration: {} }] },
    })

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON',
          label: 'Google Workspace credentials.json',
          required: false,
          sensitive: true,
          placeholder: '{"installed":{"client_id":"..."}}',
          source: 'plugin',
          sourceId: 'google-workspace',
          helpUrl: 'https://github.com/googleworkspace/cli#authentication',
        }),
      ]),
    )
  })

  it('keeps model-provider auto-detected variables out of deploy form fields', async () => {
    const fields = await collectRuntimeEnvFields({
      version: '1',
      use: [{ plugin: 'model-provider' }],
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw', configuration: {} }] },
    })

    expect(fields.map((field) => field.key)).not.toEqual(
      expect.arrayContaining(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENAI_COMPATIBLE_API_KEY']),
    )
  })

  it('keeps explicit model-provider env refs auto-detected instead of form fields', async () => {
    const fields = await collectRuntimeEnvFields({
      version: '1',
      use: [{ plugin: 'model-provider' }],
      models: {
        providers: {
          anthropic: {
            apiKey: '${env:ANTHROPIC_API_KEY}',
          },
        },
      },
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw', configuration: {} }] },
    })

    expect(fields.map((field) => field.key)).not.toContain('ANTHROPIC_API_KEY')
  })

  it('keeps explicit non-provider template env refs visible and required', async () => {
    const fields = await collectRuntimeEnvFields({
      version: '1',
      use: [{ plugin: 'model-provider' }],
      tools: {
        custom: {
          token: '${env:CUSTOM_TOOL_TOKEN}',
        },
      },
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw', configuration: {} }] },
    })

    expect(fields).toContainEqual(
      expect.objectContaining({
        key: 'CUSTOM_TOOL_TOKEN',
        required: true,
        source: 'template',
        sourceId: 'template',
      }),
    )
  })

  it('honors plugin-declared env ref aliases and ignored refs in deploy forms', async () => {
    const config = {
      version: '1',
      use: [{ plugin: 'google-workspace' }],
      legacy: {
        token: '${env:GOOGLE_WORKSPACE_CLI_TOKEN}',
        credentials: '${env:GOOGLE_WORKSPACE_CREDENTIALS_JSON}',
      },
      deployments: { agents: [{ id: 'agent-1', runtime: 'openclaw', configuration: {} }] },
    }

    const policy = await collectRuntimeEnvRefPolicy(config)
    const fields = await collectRuntimeEnvFields(config)
    const fieldKeys = fields.map((field) => field.key)

    expect(policy.aliases.GOOGLE_WORKSPACE_CREDENTIALS_JSON).toBe(
      'GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON',
    )
    expect(policy.ignoredKeys).toContain('GOOGLE_WORKSPACE_CLI_TOKEN')
    expect(extractRequiredEnvVars(config, policy)).toEqual([
      'GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON',
    ])
    expect(fieldKeys).toContain('GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON')
    expect(fieldKeys).not.toContain('GOOGLE_WORKSPACE_CREDENTIALS_JSON')
    expect(fieldKeys).not.toContain('GOOGLE_WORKSPACE_CLI_TOKEN')
  })
})

describe('model-provider plugin', () => {
  it('builds OpenClaw model providers from provider catalogs', async () => {
    const registry = createPluginRegistry()
    const provider = defineProviderPlugin(makeManifest({ id: 'provider-x' }), {
      provider: {
        id: 'provider-x',
        api: 'openai',
        envKey: 'TEST_PROVIDER_API_KEY',
        baseUrl: 'https://provider.example/v1',
        priority: 1,
        models: [
          { id: 'model-fast', tags: ['default', 'flash'] },
          { id: 'model-reasoning', tags: ['reasoning'] },
        ],
      },
    })
    const modelProvider = (await import('../../src/plugins/model-provider/index.js')).default
    registry.register(provider)
    registry.register(modelProvider)

    const fragment = modelProvider._hooks.buildConfig[0]!(
      makeBuildContext({
        pluginRegistry: registry,
        secrets: { TEST_PROVIDER_API_KEY: 'sk-provider' },
        config: {
          namespace: 'test-ns',
          agents: [],
          use: [{ plugin: 'model-provider' }],
        } as unknown as PluginBuildContext['config'],
        agent: {
          id: 'agent-1',
          name: 'Test Agent',
          runtime: 'openclaw',
          use: [{ plugin: 'model-provider' }],
        } as PluginBuildContext['agent'],
      }),
    )

    expect(fragment?.models).toMatchObject({
      mode: 'merge',
      providers: {
        'provider-x': {
          api: 'openai-completions',
          apiKey: '${env:TEST_PROVIDER_API_KEY}',
          baseUrl: 'https://provider.example/v1',
          models: [
            { id: 'model-fast', name: 'model-fast' },
            { id: 'model-reasoning', name: 'model-reasoning' },
          ],
        },
      },
    })
    expect(fragment?.agents?.defaults).toMatchObject({
      model: { primary: 'provider-x/model-fast' },
    })
  })

  it('selects saved provider profile models by tag', async () => {
    const registry = createPluginRegistry()
    const provider = defineProviderPlugin(makeManifest({ id: 'provider-profile-x' }), {
      provider: {
        id: 'provider-profile-x',
        api: 'openai',
        envKey: 'PROFILE_PROVIDER_API_KEY',
        baseUrl: 'https://provider.example/v1',
        priority: 1,
        models: [{ id: 'catalog-default', tags: ['default'] }],
      },
    })
    const modelProvider = (await import('../../src/plugins/model-provider/index.js')).default
    registry.register(provider)
    registry.register(modelProvider)

    const fragment = modelProvider._hooks.buildConfig[0]!(
      makeBuildContext({
        pluginRegistry: registry,
        secrets: {
          PROFILE_PROVIDER_API_KEY: 'sk-provider',
          SHADOW_PROVIDER_PROFILE_MODELS_JSON: JSON.stringify([
            {
              providerId: 'provider-profile-x',
              profileId: 'profile-a',
              models: [{ id: 'profile-reasoner', tags: ['reasoning'], contextWindow: 128000 }],
            },
          ]),
        },
        config: {
          namespace: 'test-ns',
          agents: [],
          use: [{ plugin: 'model-provider', options: { tag: 'reasoning' } }],
        } as unknown as PluginBuildContext['config'],
        agent: {
          id: 'agent-1',
          name: 'Test Agent',
          runtime: 'openclaw',
          use: [{ plugin: 'model-provider', options: { tag: 'reasoning' } }],
        } as PluginBuildContext['agent'],
      }),
    )

    const providerModels = fragment?.models?.providers?.['provider-profile-x']?.models
    expect(providerModels?.[0]).toMatchObject({ id: 'profile-reasoner', contextWindow: 128000 })
    expect(providerModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'profile-reasoner' }),
        expect.objectContaining({ id: 'catalog-default' }),
      ]),
    )
    expect(fragment?.agents?.defaults).toMatchObject({
      model: { primary: 'provider-profile-x/profile-reasoner' },
    })
  })

  it('uses only the OpenAI-compatible proxy when official proxy credentials are present', async () => {
    const registry = createPluginRegistry()
    const modelProvider = (await import('../../src/plugins/model-provider/index.js')).default
    registry.register(modelProvider)

    const ctx = makeBuildContext({
      pluginRegistry: registry,
      secrets: {
        OPENAI_API_KEY: 'test-direct-provider-key',
        OPENAI_COMPATIBLE_API_KEY: 'test-official-proxy-token',
        OPENAI_COMPATIBLE_BASE_URL: 'http://host.lima.internal:3002/api/ai/v1',
        OPENAI_COMPATIBLE_MODEL_ID: 'custom/deepseek-v4-flash',
      },
      config: {
        namespace: 'test-ns',
        agents: [],
        use: [{ plugin: 'model-provider' }],
      } as unknown as PluginBuildContext['config'],
      agent: {
        id: 'agent-1',
        name: 'Test Agent',
        runtime: 'openclaw',
        use: [{ plugin: 'model-provider' }],
      } as PluginBuildContext['agent'],
    })

    const fragment = modelProvider._hooks.buildConfig[0]!(ctx)
    const runtimeEnv = modelProvider._hooks.buildEnv[0]!(ctx)

    expect(fragment?.agents?.defaults).toMatchObject({
      model: {
        primary: 'custom/deepseek-v4-flash',
      },
    })
    expect(fragment?.agents?.defaults?.model).not.toHaveProperty('fallbacks')
    expect(Object.keys(fragment?.models?.providers ?? {})).toEqual(['custom'])
    expect(runtimeEnv).toEqual({
      OPENAI_COMPATIBLE_API_KEY: 'test-official-proxy-token',
      OPENAI_COMPATIBLE_BASE_URL: 'http://host.lima.internal:3002/api/ai/v1',
      OPENAI_COMPATIBLE_MODEL_ID: 'custom/deepseek-v4-flash',
    })
    expect(runtimeEnv.OPENAI_API_KEY).toBeUndefined()
  })
})

// ─── Tool plugin implementations ──────────────────────────────────────────

describe('Tool plugins', () => {
  it('github plugin should produce skill config without CLI tool allowlist', async () => {
    const mod = await import('../../src/plugins/github/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('github')

    const ctx = makeBuildContext({
      secrets: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxx' },
      agentConfig: {},
    })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.skills).toBeDefined()
    expect(fragment?.tools).toBeUndefined()
    expect(plugin.runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({
        id: 'gh',
        kind: 'system-package',
        packages: ['github-cli'],
      }),
    )
    expect(plugin.runtime?.verificationChecks).toContainEqual(
      expect.objectContaining({
        id: 'github-cli-installed',
        command: ['gh', '--version'],
      }),
    )
    const env = Object.assign({}, ...plugin._hooks.buildEnv.map((fn) => fn(ctx)))
    expect(env).toMatchObject({
      GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_xxx',
      GH_TOKEN: 'ghp_xxx',
      GITHUB_TOKEN: 'ghp_xxx',
    })
  })

  it('google-workspace plugin should expose gws runtime config', async () => {
    const mod = await import('../../src/plugins/google-workspace/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('google-workspace')
    expect(plugin.secretFields?.map((field) => field.key)).toEqual(
      expect.arrayContaining(['GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON']),
    )
    expect(plugin.secretFields?.map((field) => field.key)).not.toContain(
      'GOOGLE_WORKSPACE_CLI_TOKEN',
    )

    const ctx = makeBuildContext({
      secrets: {
        GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON: '{"installed":{}}',
      },
      agentConfig: { services: ['gmail', 'calendar'] },
    })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.tools).toBeUndefined()
    expect(fragment?.skills).toMatchObject({
      load: { extraDirs: ['/workspace/.agents/plugin-skills/google-workspace'] },
      entries: {
        'google-workspace': {
          enabled: true,
          config: {
            services: ['gmail', 'calendar'],
            skillSources: ['/workspace/.agents/plugin-skills/google-workspace'],
          },
          env: {
            GOOGLE_WORKSPACE_SERVICES: 'gmail,calendar',
          },
        },
      },
    })
    expect(plugin.mcp).toBeUndefined()

    const env = plugin._hooks.buildEnv[0]!(ctx)
    expect(env?.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE).toBe(
      '/home/shadow/.config/gws/credentials.json',
    )
    expect(env?.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON).toBe('{"installed":{}}')
    expect(env?.GOOGLE_WORKSPACE_CLI_TOKEN).toBeUndefined()

    const legacyEnv = plugin._hooks.buildEnv[0]!(
      makeBuildContext({
        secrets: { GOOGLE_WORKSPACE_CREDENTIALS_JSON: '{"installed":{}}' },
      }),
    )
    expect(legacyEnv?.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON).toBe('{"installed":{}}')

    const tokenOnlyEnv = plugin._hooks.buildEnv[0]!(
      makeBuildContext({
        secrets: { GOOGLE_WORKSPACE_CLI_TOKEN: 'ya29.only-token' },
      }),
    )
    expect(tokenOnlyEnv?.GOOGLE_WORKSPACE_CLI_TOKEN).toBeUndefined()
    expect(tokenOnlyEnv?.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON).toBeUndefined()

    const legacyServiceAccountEnv = plugin._hooks.buildEnv[0]!(
      makeBuildContext({
        secrets: { GOOGLE_WORKSPACE_ADC_JSON: '{"type":"service_account"}' },
      }),
    )
    expect(legacyServiceAccountEnv?.GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON).toBe(
      '{"type":"service_account"}',
    )
    expect(legacyServiceAccountEnv?.GOOGLE_APPLICATION_CREDENTIALS_JSON).toBe(
      '{"type":"service_account"}',
    )

    const runtime = plugin._hooks.buildRuntime[0]!(ctx)
    expect(runtime?.credentialFiles).toContainEqual({
      envKey: 'GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON',
      path: '/home/shadow/.config/gws/credentials.json',
      mode: '0600',
    })
    expect(runtime?.runtimeDependencies).toContainEqual(
      expect.objectContaining({
        id: 'gws-cli',
        kind: 'npm-global',
        packages: ['@googleworkspace/cli'],
      }),
    )
    expect(runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'google-workspace-cli-skills',
        includePattern: 'gws-*',
        targetPath: '/workspace/.agents/plugin-skills/google-workspace',
      }),
    )
    expect(runtime?.verificationChecks?.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        'google-workspace-cli-installed',
        'google-workspace-auth',
        'google-workspace-drive-read',
      ]),
    )
    expect(
      runtime?.verificationChecks?.find((check) => check.id === 'google-workspace-auth')
        ?.requiredEnvAny,
    ).toEqual(['GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON'])
  })

  it('google-workspace plugin should install gws and Workspace skills for enabled agents', async () => {
    const mod = await import('../../src/plugins/google-workspace/index.js')
    const plugin = mod.default as PluginDefinition
    const result = plugin.k8s?.buildK8s(
      {
        id: 'agent-1',
        runtime: 'openclaw',
        use: [{ plugin: 'google-workspace' }],
        configuration: {},
      },
      {
        agent: {
          id: 'agent-1',
          runtime: 'openclaw',
          configuration: {},
        },
        config: { version: '1' },
        namespace: 'default',
      },
    )

    const installCommand = result?.initContainers?.[0]?.command.join(' ')
    expect(result?.initContainers?.[0]?.name).toBe('google-workspace-assets')
    expect(installCommand).toContain('@googleworkspace/cli')
    expect(installCommand).toContain('/runtime-deps/bin/gws --version')
    expect(installCommand).toContain('test -f /plugin-skills/gws-shared/SKILL.md')
    expect(installCommand).toContain('https://github.com/googleworkspace/cli.git')
    expect(result?.initContainers?.[0]?.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      runAsNonRoot: false,
      runAsUser: 0,
      runAsGroup: 0,
      capabilities: { drop: ['ALL'] },
    })
    expect(result?.envVars?.find((env) => env.name === 'PATH')?.value).toBe(
      '/opt/shadow-plugin-deps/google-workspace/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    )
    expect(result?.volumeMounts).toEqual(
      expect.arrayContaining([
        {
          name: 'google-workspace-runtime',
          mountPath: '/opt/shadow-plugin-deps/google-workspace',
          readOnly: true,
        },
        {
          name: 'google-workspace-skills',
          mountPath: '/workspace/.agents/plugin-skills/google-workspace',
          readOnly: true,
        },
      ]),
    )
  })

  it('lovart plugin should mount the OpenClaw skill with credential env refs', async () => {
    const mod = await import('../../src/plugins/lovart/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('lovart')

    const ctx = makeBuildContext({
      secrets: {
        LOVART_ACCESS_KEY: 'ak_test',
        LOVART_SECRET_KEY: 'sk_test',
      },
    })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.skills).toMatchObject({
      load: { extraDirs: ['/workspace/.agents/plugin-skills/lovart'] },
      entries: {
        'lovart-skill': {
          enabled: true,
          env: {
            LOVART_ACCESS_KEY: '${env:LOVART_ACCESS_KEY}',
            LOVART_SECRET_KEY: '${env:LOVART_SECRET_KEY}',
          },
        },
      },
    })

    const env = plugin._hooks.buildEnv[0]!(ctx)
    expect(env).toMatchObject({
      LOVART_ACCESS_KEY: 'ak_test',
      LOVART_SECRET_KEY: 'sk_test',
    })

    const runtime = plugin._hooks.buildRuntime[0]!(ctx)
    expect(runtime?.skillSources).toContainEqual(
      expect.objectContaining({
        id: 'lovart-openclaw-skill',
        targetPath: '/workspace/.agents/plugin-skills/lovart',
      }),
    )
  })

  it('sherlock plugin should install Python venv at its final runtime mount path', async () => {
    const mod = await import('../../src/plugins/sherlock/index.js')
    const plugin = mod.default as PluginDefinition
    const result = plugin.k8s?.buildK8s(
      {
        id: 'agent-1',
        runtime: 'openclaw',
        use: [{ plugin: 'sherlock' }],
        configuration: {},
      },
      {
        agent: {
          id: 'agent-1',
          runtime: 'openclaw',
          configuration: {},
        },
        config: { version: '1' },
        namespace: 'default',
      },
    )

    const initContainer = result?.initContainers?.[0]
    const installCommand = initContainer?.command.join(' ')
    expect(initContainer?.volumeMounts).toContainEqual({
      name: 'sherlock-runtime',
      mountPath: '/opt/shadow-plugin-deps/sherlock',
    })
    expect(installCommand).toContain("python3 -m venv '/opt/shadow-plugin-deps/sherlock/venv'")
    expect(installCommand).toContain('pip')
    expect(installCommand).toContain('sherlock-project')
    expect(result?.envVars?.find((env) => env.name === 'PATH')?.value).toBe(
      '/opt/shadow-plugin-deps/sherlock/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    )
  })

  it('stripe plugin should produce plugin entry', async () => {
    const mod = await import('../../src/plugins/stripe/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('stripe')

    const ctx = makeBuildContext({ secrets: { STRIPE_SECRET_KEY: 'sk_test' }, agentConfig: {} })
    const result = plugin._hooks.validate[0]!(ctx)
    expect(result?.valid).toBe(true)
  })

  it('lark plugin should inject CLI credentials through config files and omit MCP', async () => {
    const mod = await import('../../src/plugins/lark/index.js')
    const plugin = mod.default as PluginDefinition
    expect(plugin.manifest.id).toBe('lark')
    expect(plugin.mcp).toBeUndefined()
    expect(plugin.runtime?.mcpServers).toBeUndefined()
    expect(plugin.cli?.map((tool) => tool.command)).toEqual(
      expect.arrayContaining(['lark-cli', 'meegle']),
    )
    expect(
      plugin.secretFields
        ?.filter((field) => field.key.startsWith('LARKSUITE_CLI_'))
        .every((field) => field.runtime === false),
    ).toBe(true)
    expect(
      plugin.secretFields?.find((field) => field.key === 'MEEGLE_USER_ACCESS_TOKEN')?.runtime,
    ).toBeUndefined()

    const ctx = makeBuildContext({
      secrets: {
        LARKSUITE_CLI_APP_ID: 'cli_app',
        LARKSUITE_CLI_APP_SECRET: 'app_secret',
        LARKSUITE_CLI_BRAND: 'lark',
        MEEGLE_HOST: 'project.feishu.cn',
        MEEGLE_USER_ACCESS_TOKEN: 'meegle-token',
      },
    })
    const fragment = plugin._hooks.buildConfig[0]!(ctx)
    expect(fragment?.skills).toMatchObject({
      load: { extraDirs: ['/workspace/.agents/plugin-skills/lark'] },
      entries: {
        lark: {
          enabled: true,
          config: {
            cli: { lark: 'lark-cli', meegle: 'meegle' },
            skillSources: ['/workspace/.agents/plugin-skills/lark'],
          },
        },
      },
    })

    const env = Object.assign({}, ...plugin._hooks.buildEnv.map((fn) => fn(ctx)))
    expect(env.LARKSUITE_CLI_CONFIG_DIR).toBe('/home/shadow/.lark-cli')
    expect(env.LARKSUITE_CLI_APP_ID).toBeUndefined()
    expect(env.LARKSUITE_CLI_APP_SECRET).toBeUndefined()
    expect(env.MEEGLE_HOST).toBe('project.feishu.cn')
    expect(env.MEEGLE_USER_ACCESS_TOKEN).toBe('meegle-token')
    const larkConfig = JSON.parse(env.LARKSUITE_CLI_CREDENTIALS_JSON)
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

    expect(plugin.runtime?.credentialFiles).toEqual(
      expect.arrayContaining([
        {
          envKey: 'LARKSUITE_CLI_CREDENTIALS_JSON',
          path: '/home/shadow/.lark-cli/config.json',
          mode: '0600',
        },
        {
          envKey: 'LARKSUITE_CLI_CREDENTIALS_JSON',
          path: '/home/shadow/.lark-cli/openclaw/config.json',
          mode: '0600',
        },
      ]),
    )
    expect(plugin.runtime?.verificationChecks?.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        'lark-cli-installed',
        'meegle-cli-installed',
        'lark-cli-auth-status',
        'lark-skills-mounted',
        'meegle-skill-mounted',
      ]),
    )
    expect(
      plugin.runtime?.verificationChecks?.find((check) => check.id === 'meegle-cli-installed'),
    ).toMatchObject({ command: ['meegle', 'version'] })
    const k8s = plugin.k8s?.buildK8s(
      {
        id: 'agent-1',
        runtime: 'openclaw',
        use: [{ plugin: 'lark' }],
        configuration: {},
      },
      {
        agent: { id: 'agent-1', runtime: 'openclaw', configuration: {} },
        config: { version: '1' },
        namespace: 'default',
      },
    )
    expect(k8s?.initContainers?.[0]?.command.join(' ')).toContain(
      '/runtime-deps/bin/meegle version',
    )
  })
})
