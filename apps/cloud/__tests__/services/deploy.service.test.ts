import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudConfig } from '../../src/config/schema.js'
import { DeployService } from '../../src/services/deploy.service.js'

const originalShadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL
const originalShadowServerUrl = process.env.SHADOW_SERVER_URL

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
      getStackOutputs: vi.fn().mockResolvedValue({}),
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
      getStackOutputs: vi.fn().mockResolvedValue({}),
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
      getStackOutputs: vi.fn().mockResolvedValue({}),
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
})
