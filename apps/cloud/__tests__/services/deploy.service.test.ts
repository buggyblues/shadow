import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudConfig } from '../../src/config/schema.js'
import { DeployService } from '../../src/services/deploy.service.js'

const originalShadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL
const originalShadowServerUrl = process.env.SHADOW_SERVER_URL
const originalHome = process.env.HOME

describe('DeployService', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deploy-service-test-'))
    process.env.SHADOW_SERVER_URL = 'http://server:3002'
    process.env.SHADOW_AGENT_SERVER_URL = 'http://host.lima.internal:3002'
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()

    if (originalShadowAgentServerUrl === undefined) {
      delete process.env.SHADOW_AGENT_SERVER_URL
    } else {
      process.env.SHADOW_AGENT_SERVER_URL = originalShadowAgentServerUrl
    }

    if (originalShadowServerUrl === undefined) {
      delete process.env.SHADOW_SERVER_URL
    } else {
      process.env.SHADOW_SERVER_URL = originalShadowServerUrl
    }

    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
  })

  it('prefers SHADOW_AGENT_SERVER_URL for pod-facing shadowServerUrl', async () => {
    const filePath = join(tempDir, 'shadowob-cloud.json')
    writeFileSync(filePath, JSON.stringify({ ok: true }), 'utf8')

    const config: CloudConfig = {
      version: '1.0.0',
      deployments: {
        namespace: 'shadowob-cloud',
        agents: [
          {
            id: 'buddy-agent',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
          },
        ],
      },
    } as CloudConfig

    const configService = {
      parseFile: vi.fn().mockResolvedValue(config),
      resolve: vi.fn().mockResolvedValue(config),
    }
    const manifestService = {
      build: vi.fn(),
    }
    const stack = { cancel: vi.fn().mockResolvedValue(undefined) }
    const k8s = {
      isToolInstalled: vi.fn().mockReturnValue(true),
      kindClusterExists: vi.fn().mockReturnValue(true),
      createKindCluster: vi.fn(),
      isKubeReachable: vi.fn().mockReturnValue(true),
      getOrCreateStack: vi.fn().mockResolvedValue(stack),
      deployStack: vi.fn().mockResolvedValue(undefined),
      waitForAgentSandboxReady: vi.fn().mockResolvedValue({ runtimeState: 'running' }),
      getStackOutputs: vi.fn().mockResolvedValue({}),
      checkAgentSandboxPreflight: vi.fn().mockReturnValue({ ok: true, missing: [], warnings: [] }),
    }
    const logger = {
      step: vi.fn(),
      info: vi.fn(),
      dim: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    }

    const service = new DeployService(
      configService as never,
      manifestService as never,
      k8s as never,
      logger as never,
    )

    await service.up({
      filePath,
      shadowUrl: 'http://server:3002',
      shadowToken: 'pat_test',
      skipProvision: true,
    })

    expect(k8s.getOrCreateStack).toHaveBeenCalledWith(
      expect.objectContaining({
        stackName: 'dev-shadowob-cloud',
        shadowServerUrl: 'http://host.lima.internal:3002',
      }),
    )
  })

  it('uses per-request runtime env overrides before ambient process env', async () => {
    const filePath = join(tempDir, 'shadowob-cloud.json')
    writeFileSync(filePath, JSON.stringify({ ok: true }), 'utf8')

    const config: CloudConfig = {
      version: '1.0.0',
      deployments: {
        namespace: 'shadowob-cloud',
        agents: [
          {
            id: 'buddy-agent',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
          },
        ],
      },
    } as CloudConfig

    const configService = {
      parseFile: vi.fn().mockResolvedValue(config),
      resolve: vi.fn().mockResolvedValue(config),
    }
    const manifestService = {
      build: vi.fn(),
    }
    const stack = { cancel: vi.fn().mockResolvedValue(undefined) }
    const k8s = {
      isToolInstalled: vi.fn().mockReturnValue(true),
      kindClusterExists: vi.fn().mockReturnValue(true),
      createKindCluster: vi.fn(),
      isKubeReachable: vi.fn().mockReturnValue(true),
      getOrCreateStack: vi.fn().mockResolvedValue(stack),
      deployStack: vi.fn().mockResolvedValue(undefined),
      waitForAgentSandboxReady: vi.fn().mockResolvedValue({ runtimeState: 'running' }),
      getStackOutputs: vi.fn().mockResolvedValue({}),
      checkAgentSandboxPreflight: vi.fn().mockReturnValue({ ok: true, missing: [], warnings: [] }),
    }
    const logger = {
      step: vi.fn(),
      info: vi.fn(),
      dim: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    }

    const service = new DeployService(
      configService as never,
      manifestService as never,
      k8s as never,
      logger as never,
    )

    await service.up({
      filePath,
      shadowUrl: 'http://server:3002',
      shadowToken: 'pat_test',
      skipProvision: true,
      runtimeEnvVars: {
        SHADOW_AGENT_SERVER_URL: 'http://tenant-agent-url:3002',
        ANTHROPIC_API_KEY: 'tenant-key',
      },
    })

    expect(configService.resolve).toHaveBeenCalledWith(
      config,
      tempDir,
      expect.objectContaining({
        env: expect.objectContaining({
          SHADOW_AGENT_SERVER_URL: 'http://tenant-agent-url:3002',
          ANTHROPIC_API_KEY: 'tenant-key',
        }),
      }),
    )
    expect(k8s.getOrCreateStack).toHaveBeenCalledWith(
      expect.objectContaining({
        shadowServerUrl: 'http://tenant-agent-url:3002',
        runtimeEnvVars: expect.objectContaining({
          ANTHROPIC_API_KEY: 'tenant-key',
          SHADOW_AGENT_SERVER_URL: 'http://tenant-agent-url:3002',
        }),
      }),
    )
  })

  it('scopes the default Pulumi stack name by namespace', async () => {
    const filePath = join(tempDir, 'shadowob-cloud.json')
    writeFileSync(filePath, JSON.stringify({ ok: true }), 'utf8')

    const config: CloudConfig = {
      version: '1.0.0',
      deployments: {
        namespace: 'marketingskills-buddy',
        agents: [
          {
            id: 'buddy-agent',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
          },
        ],
      },
    } as CloudConfig

    const configService = {
      parseFile: vi.fn().mockResolvedValue(config),
      resolve: vi.fn().mockResolvedValue(config),
    }
    const manifestService = {
      build: vi.fn(),
    }
    const stack = { cancel: vi.fn().mockResolvedValue(undefined) }
    const k8s = {
      isToolInstalled: vi.fn().mockReturnValue(true),
      kindClusterExists: vi.fn().mockReturnValue(true),
      createKindCluster: vi.fn(),
      isKubeReachable: vi.fn().mockReturnValue(true),
      getOrCreateStack: vi.fn().mockResolvedValue(stack),
      deployStack: vi.fn().mockResolvedValue(undefined),
      waitForAgentSandboxReady: vi.fn().mockResolvedValue({ runtimeState: 'running' }),
      getStackOutputs: vi.fn().mockResolvedValue({}),
      checkAgentSandboxPreflight: vi.fn().mockReturnValue({ ok: true, missing: [], warnings: [] }),
    }
    const logger = {
      step: vi.fn(),
      info: vi.fn(),
      dim: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    }

    const service = new DeployService(
      configService as never,
      manifestService as never,
      k8s as never,
      logger as never,
    )

    await service.up({
      filePath,
      shadowUrl: 'http://server:3002',
      shadowToken: 'pat_test',
      skipProvision: true,
    })

    expect(k8s.getOrCreateStack).toHaveBeenCalledWith(
      expect.objectContaining({
        stackName: 'dev-marketingskills-buddy',
      }),
    )
  })

  it('waits for agent-sandbox workloads before reporting deployment complete', async () => {
    const filePath = join(tempDir, 'shadowob-cloud.json')
    writeFileSync(filePath, JSON.stringify({ ok: true }), 'utf8')

    const config: CloudConfig = {
      version: '1.0.0',
      deployments: {
        backend: 'agent-sandbox',
        namespace: 'gstack-buddy',
        agents: [
          {
            id: 'strategy-buddy',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
          },
        ],
      },
    } as CloudConfig

    const configService = {
      parseFile: vi.fn().mockResolvedValue(config),
      resolve: vi.fn().mockResolvedValue(config),
    }
    const stack = { cancel: vi.fn().mockResolvedValue(undefined) }
    const k8s = {
      isToolInstalled: vi.fn().mockReturnValue(true),
      kindClusterExists: vi.fn().mockReturnValue(true),
      createKindCluster: vi.fn(),
      isKubeReachable: vi.fn().mockReturnValue(true),
      getOrCreateStack: vi.fn().mockResolvedValue(stack),
      deployStack: vi.fn().mockResolvedValue(undefined),
      waitForAgentSandboxReady: vi.fn().mockResolvedValue({ runtimeState: 'running' }),
      getStackOutputs: vi.fn().mockResolvedValue({}),
      checkAgentSandboxPreflight: vi.fn().mockReturnValue({ ok: true, missing: [], warnings: [] }),
    }
    const logger = {
      step: vi.fn(),
      info: vi.fn(),
      dim: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    }
    const service = new DeployService(
      configService as never,
      { build: vi.fn() } as never,
      k8s as never,
      logger as never,
    )

    await service.up({
      filePath,
      shadowUrl: 'http://server:3002',
      shadowToken: 'pat_test',
      skipProvision: true,
    })

    expect(k8s.waitForAgentSandboxReady).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'gstack-buddy',
        agentName: 'strategy-buddy',
      }),
    )
    expect(logger.success).toHaveBeenCalledWith('Deployment complete!')
  })

  it('uses managed cluster metadata to default CLI deployments to agent-sandbox', async () => {
    process.env.HOME = tempDir
    const clustersDir = join(tempDir, '.shadow-cloud', 'clusters')
    const filePath = join(tempDir, 'shadowob-cloud.json')
    const kubeconfigPath = join(clustersDir, 'managed.yaml')
    mkdirSync(clustersDir, { recursive: true })
    writeFileSync(filePath, JSON.stringify({ ok: true }), 'utf8')
    writeFileSync(
      kubeconfigPath,
      'apiVersion: v1\nkind: Config\ncurrent-context: managed-context\n',
      'utf8',
    )
    writeFileSync(
      join(clustersDir, 'managed.json'),
      JSON.stringify({
        name: 'managed',
        masterHost: '203.0.113.10',
        nodeCount: 1,
        createdAt: new Date().toISOString(),
        kubeconfigPath,
        features: {
          sandbox: {
            enabled: true,
            version: 'v0.4.5',
            runtimeClassName: 'shadow-runc',
          },
        },
      }),
      'utf8',
    )

    const config: CloudConfig = {
      version: '1.0.0',
      deployments: {
        namespace: 'managed-sandbox',
        agents: [
          {
            id: 'buddy-agent',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
          },
        ],
      },
    } as CloudConfig

    const configService = {
      parseFile: vi.fn().mockResolvedValue(config),
      resolve: vi.fn().mockResolvedValue(config),
    }
    const stack = { cancel: vi.fn().mockResolvedValue(undefined) }
    const k8s = {
      isToolInstalled: vi.fn().mockReturnValue(true),
      kindClusterExists: vi.fn().mockReturnValue(true),
      createKindCluster: vi.fn(),
      isKubeReachable: vi.fn().mockReturnValue(true),
      getOrCreateStack: vi.fn().mockResolvedValue(stack),
      deployStack: vi.fn().mockResolvedValue(undefined),
      waitForAgentSandboxReady: vi.fn().mockResolvedValue({ runtimeState: 'running' }),
      getStackOutputs: vi.fn().mockResolvedValue({}),
      checkAgentSandboxPreflight: vi.fn().mockReturnValue({ ok: true, missing: [], warnings: [] }),
    }
    const logger = {
      step: vi.fn(),
      info: vi.fn(),
      dim: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    }
    const service = new DeployService(
      configService as never,
      { build: vi.fn() } as never,
      k8s as never,
      logger as never,
    )

    await service.up({
      filePath,
      shadowUrl: 'http://server:3002',
      shadowToken: 'pat_test',
      skipProvision: true,
      cluster: 'managed',
    })

    expect(configService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        deployments: expect.objectContaining({
          backend: 'agent-sandbox',
          sandbox: { runtimeClassName: 'shadow-runc' },
        }),
      }),
      tempDir,
      expect.any(Object),
    )
    expect(k8s.waitForAgentSandboxReady).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'managed-sandbox',
        agentName: 'buddy-agent',
      }),
    )
  })

  it('falls back to deployment when sandbox-preferred preflight fails', async () => {
    const filePath = join(tempDir, 'shadowob-cloud.json')
    writeFileSync(filePath, JSON.stringify({ ok: true }), 'utf8')

    const config: CloudConfig = {
      version: '1.0.0',
      deployments: {
        backend: 'agent-sandbox',
        backendPolicy: 'sandbox-preferred',
        namespace: 'fallback-sandbox',
        agents: [
          {
            id: 'buddy-agent',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
          },
        ],
      },
    } as CloudConfig

    const configService = {
      parseFile: vi.fn().mockResolvedValue(config),
      resolve: vi.fn().mockResolvedValue(config),
    }
    const stack = { cancel: vi.fn().mockResolvedValue(undefined) }
    const k8s = {
      isToolInstalled: vi.fn().mockReturnValue(true),
      kindClusterExists: vi.fn().mockReturnValue(true),
      createKindCluster: vi.fn(),
      isKubeReachable: vi.fn().mockReturnValue(true),
      getOrCreateStack: vi.fn().mockResolvedValue(stack),
      deployStack: vi.fn().mockResolvedValue(undefined),
      waitForAgentSandboxReady: vi.fn(),
      getStackOutputs: vi.fn().mockResolvedValue({}),
      checkAgentSandboxPreflight: vi.fn().mockReturnValue({
        ok: false,
        missing: ['CRD sandboxclaims.extensions.agents.x-k8s.io'],
        warnings: [],
      }),
    }
    const logger = {
      step: vi.fn(),
      info: vi.fn(),
      dim: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    }
    const service = new DeployService(
      configService as never,
      { build: vi.fn() } as never,
      k8s as never,
      logger as never,
    )

    await service.up({
      filePath,
      shadowUrl: 'http://server:3002',
      shadowToken: 'pat_test',
      skipProvision: true,
    })

    expect(k8s.getOrCreateStack).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          deployments: expect.objectContaining({
            backend: 'deployment',
            backendPolicy: 'deployment-only',
          }),
        }),
      }),
    )
    expect(k8s.waitForAgentSandboxReady).not.toHaveBeenCalled()
  })

  it('preflights every sandbox runtime class used by resolved agents', async () => {
    const filePath = join(tempDir, 'shadowob-cloud.json')
    writeFileSync(filePath, JSON.stringify({ ok: true }), 'utf8')

    const config: CloudConfig = {
      version: '1.0.0',
      deployments: {
        backend: 'agent-sandbox',
        namespace: 'multi-runtime-sandbox',
        sandbox: { runtimeClassName: 'shadow-runc' },
        agents: [
          {
            id: 'buddy-agent',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
          },
          {
            id: 'tool-agent',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
            sandbox: { runtimeClassName: 'gvisor' },
          },
        ],
      },
    } as CloudConfig

    const configService = {
      parseFile: vi.fn().mockResolvedValue(config),
      resolve: vi.fn().mockResolvedValue(config),
    }
    const stack = { cancel: vi.fn().mockResolvedValue(undefined) }
    const k8s = {
      isToolInstalled: vi.fn().mockReturnValue(true),
      kindClusterExists: vi.fn().mockReturnValue(true),
      createKindCluster: vi.fn(),
      isKubeReachable: vi.fn().mockReturnValue(true),
      getOrCreateStack: vi.fn().mockResolvedValue(stack),
      deployStack: vi.fn().mockResolvedValue(undefined),
      waitForAgentSandboxReady: vi.fn().mockResolvedValue({ runtimeState: 'running' }),
      getStackOutputs: vi.fn().mockResolvedValue({}),
      checkAgentSandboxPreflight: vi.fn().mockReturnValue({ ok: true, missing: [], warnings: [] }),
    }
    const logger = {
      step: vi.fn(),
      info: vi.fn(),
      dim: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    }
    const service = new DeployService(
      configService as never,
      { build: vi.fn() } as never,
      k8s as never,
      logger as never,
    )

    await service.up({
      filePath,
      shadowUrl: 'http://server:3002',
      shadowToken: 'pat_test',
      skipProvision: true,
    })

    expect(k8s.checkAgentSandboxPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeClassNames: ['shadow-runc', 'gvisor'],
      }),
    )
  })

  it('destroys through the Pulumi stack with the selected kubeconfig', async () => {
    const kubeconfigPath = join(tempDir, 'byok-kubeconfig.yaml')
    writeFileSync(kubeconfigPath, 'apiVersion: v1\nkind: Config\ncurrent-context: byok-context\n')
    const config: CloudConfig = {
      version: '1.0.0',
      deployments: {
        namespace: 'qa-destroy',
        agents: [
          {
            id: 'buddy-agent',
            runtime: 'openclaw',
            configuration: { openclaw: {} },
          },
        ],
      },
    } as CloudConfig

    const stack = { cancel: vi.fn().mockResolvedValue(undefined) }
    const k8s = {
      getOrCreateStack: vi.fn().mockResolvedValue(stack),
      destroyStack: vi.fn().mockResolvedValue(undefined),
    }
    const logger = {
      step: vi.fn(),
      success: vi.fn(),
    }
    const service = new DeployService({} as never, {} as never, k8s as never, logger as never)

    await service.destroy({
      namespace: 'qa-destroy',
      stack: 'saas-qa-destroy',
      k8sContext: 'byok-context',
      kubeConfigPath: kubeconfigPath,
      config,
    })

    expect(k8s.getOrCreateStack).toHaveBeenCalledWith(
      expect.objectContaining({
        stackName: 'saas-qa-destroy',
        namespace: 'qa-destroy',
        kubeContext: 'byok-context',
        kubeConfigPath: kubeconfigPath,
        config,
      }),
    )
    expect(k8s.destroyStack).toHaveBeenCalledWith(stack, expect.any(Object))
  })

  it('refuses destroy without a Pulumi config snapshot', async () => {
    const k8s = {
      getOrCreateStack: vi.fn(),
      destroyStack: vi.fn(),
    }
    const logger = {
      step: vi.fn(),
      success: vi.fn(),
    }
    const service = new DeployService({} as never, {} as never, k8s as never, logger as never)

    await expect(service.destroy({ namespace: 'qa-destroy' })).rejects.toThrow(
      'without a Pulumi config snapshot',
    )
    expect(k8s.getOrCreateStack).not.toHaveBeenCalled()
    expect(k8s.destroyStack).not.toHaveBeenCalled()
  })
})
