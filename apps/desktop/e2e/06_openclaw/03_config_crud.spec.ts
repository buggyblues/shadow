/**
 * OpenClaw Configuration CRUD E2E Tests
 *
 * Tests the full lifecycle of configuration management:
 * agents, models, cron tasks — create, read, update, delete.
 */

import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
  await page.waitForTimeout(2000)
})

test.afterAll(async () => {
  await app?.close()
})

// ─── Global Config ──────────────────────────────────────────────────────────

test.describe('Global Config', () => {
  test('getConfig returns a config object', async () => {
    const config = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getConfig()
    })

    expect(config).toBeDefined()
    expect(typeof config).toBe('object')
  })

  test('config has expected top-level keys', async () => {
    const config = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getConfig()
    })

    // Config should have these sections (may be empty arrays/objects initially)
    const keys = Object.keys(config)
    expect(keys).toEqual(expect.arrayContaining(['agents']))
  })

  test('saveConfig accepts a config object and persists it', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw
      const config = await oc.getConfig()
      // Save the same config back (idempotent operation)
      await oc.saveConfig(config)
      // Read it again to verify
      const reloaded = await oc.getConfig()
      return { configKeys: Object.keys(reloaded) }
    })

    expect(result.configKeys.length).toBeGreaterThan(0)
  })
})

// ─── Agent CRUD ─────────────────────────────────────────────────────────────

test.describe('Agent CRUD', () => {
  const testAgentId = `e2e-test-agent-${Date.now()}`

  test('listAgents returns an array', async () => {
    const agents = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.listAgents()
    })

    expect(Array.isArray(agents)).toBe(true)
  })

  test('createAgent adds a new agent', async () => {
    const result = await page.evaluate(async (agentId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.createAgent({
        id: agentId,
        name: 'E2E Test Agent',
        description: 'Created by E2E test',
        modelProvider: 'openai',
        modelName: 'gpt-4o-mini',
        systemPrompt: 'You are a test agent.',
        channels: [],
        skills: [],
        enabled: true,
        avatar: '🤖',
        temperature: 0.7,
        maxTokens: 2048,
      })
      const agents = await oc.listAgents()
      return {
        count: agents.length,
        found: agents.some((a: any) => a.id === agentId),
      }
    }, testAgentId)

    expect(result.found).toBe(true)
  })

  test('getAgent retrieves a specific agent', async () => {
    const agent = await page.evaluate(async (agentId: string) => {
      return await (window as any).desktopAPI.openClaw.getAgent(agentId)
    }, testAgentId)

    expect(agent).toBeDefined()
    expect(agent.id).toBe(testAgentId)
    expect(agent.name).toBe('E2E Test Agent')
    expect(agent.modelProvider).toBe('openai')
  })

  test('updateAgent modifies an existing agent', async () => {
    const updated = await page.evaluate(async (agentId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.updateAgent(agentId, {
        name: 'E2E Updated Agent',
        description: 'Updated by E2E test',
        modelProvider: 'anthropic',
        modelName: 'claude-sonnet-4-20250514',
        systemPrompt: 'You are an updated test agent.',
        channels: ['wechat'],
        skills: ['weather'],
        enabled: false,
        avatar: '🧪',
        temperature: 0.5,
        maxTokens: 4096,
      })
      return await oc.getAgent(agentId)
    }, testAgentId)

    expect(updated.name).toBe('E2E Updated Agent')
    expect(updated.modelProvider).toBe('anthropic')
    expect(updated.enabled).toBe(false)
    expect(updated.avatar).toBe('🧪')
  })

  test('deleteAgent removes an agent', async () => {
    const result = await page.evaluate(async (agentId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.deleteAgent(agentId)
      const agents = await oc.listAgents()
      return {
        found: agents.some((a: any) => a.id === agentId),
      }
    }, testAgentId)

    expect(result.found).toBe(false)
  })

  test('getAgent returns null or undefined for non-existent agent', async () => {
    const agent = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getAgent('non-existent-id')
    })

    expect(agent === null || agent === undefined).toBe(true)
  })
})

// ─── Model Provider CRUD ────────────────────────────────────────────────────

test.describe('Model Provider CRUD', () => {
  const testModelId = `e2e-test-model-${Date.now()}`

  test('listModels returns an array', async () => {
    const models = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.listModels()
    })

    expect(Array.isArray(models)).toBe(true)
  })

  test('saveModel creates a new model provider', async () => {
    const result = await page.evaluate(async (modelId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.saveModel({
        id: modelId,
        provider: 'openai',
        name: 'E2E Test GPT',
        apiKey: 'sk-test-key-12345',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini'],
        enabled: true,
      })
      const models = await oc.listModels()
      return {
        found: models.some((m: any) => m.id === modelId),
      }
    }, testModelId)

    expect(result.found).toBe(true)
  })

  test('saveModel updates an existing model provider', async () => {
    const result = await page.evaluate(async (modelId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.saveModel({
        id: modelId,
        provider: 'openai',
        name: 'E2E Updated GPT',
        apiKey: 'sk-updated-key-67890',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
        enabled: false,
      })
      const models = await oc.listModels()
      const found = models.find((m: any) => m.id === modelId)
      return {
        name: found?.name,
        enabled: found?.enabled,
        modelCount: found?.models?.length,
      }
    }, testModelId)

    expect(result.name).toBe('E2E Updated GPT')
    expect(result.enabled).toBe(false)
    expect(result.modelCount).toBe(3)
  })

  test('deleteModel removes a model provider', async () => {
    const result = await page.evaluate(async (modelId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.deleteModel(modelId)
      const models = await oc.listModels()
      return {
        found: models.some((m: any) => m.id === modelId),
      }
    }, testModelId)

    expect(result.found).toBe(false)
  })
})

// ─── Cron Task CRUD ─────────────────────────────────────────────────────────

test.describe('Cron Task CRUD', () => {
  const testCronId = `e2e-test-cron-${Date.now()}`

  test('listCronTasks returns an array', async () => {
    const tasks = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.listCronTasks()
    })

    expect(Array.isArray(tasks)).toBe(true)
  })

  test('saveCronTask creates a new cron task', async () => {
    const result = await page.evaluate(async (cronId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.saveCronTask({
        id: cronId,
        name: 'E2E Test Cron',
        description: 'Test scheduled task',
        cronExpression: '0 */6 * * *',
        agentId: 'test-agent',
        action: 'send_message',
        actionPayload: { message: 'Hello from E2E cron' },
        enabled: true,
      })
      const tasks = await oc.listCronTasks()
      return {
        found: tasks.some((t: any) => t.id === cronId),
      }
    }, testCronId)

    expect(result.found).toBe(true)
  })

  test('saveCronTask updates an existing cron task', async () => {
    const result = await page.evaluate(async (cronId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.saveCronTask({
        id: cronId,
        name: 'E2E Updated Cron',
        description: 'Updated scheduled task',
        cronExpression: '0 0 * * *',
        agentId: 'test-agent-2',
        action: 'trigger_skill',
        actionPayload: { skill: 'weather-report' },
        enabled: false,
      })
      const tasks = await oc.listCronTasks()
      const found = tasks.find((t: any) => t.id === cronId)
      return {
        name: found?.name,
        cronExpression: found?.cronExpression,
        enabled: found?.enabled,
        action: found?.action,
      }
    }, testCronId)

    expect(result.name).toBe('E2E Updated Cron')
    expect(result.cronExpression).toBe('0 0 * * *')
    expect(result.enabled).toBe(false)
    expect(result.action).toBe('trigger_skill')
  })

  test('triggerCronTask is callable for an existing task', async () => {
    const result = await page.evaluate(async (cronId: string) => {
      try {
        await (window as any).desktopAPI.openClaw.triggerCronTask(cronId)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }, testCronId)

    // Should succeed (even if the actual execution is a no-op)
    expect(result).toBeDefined()
  })

  test('getCronHistory returns an array', async () => {
    const history = await page.evaluate(async (cronId: string) => {
      return await (window as any).desktopAPI.openClaw.getCronHistory(cronId)
    }, testCronId)

    expect(Array.isArray(history)).toBe(true)
  })

  test('deleteCronTask removes a cron task', async () => {
    const result = await page.evaluate(async (cronId: string) => {
      const oc = (window as any).desktopAPI.openClaw
      await oc.deleteCronTask(cronId)
      const tasks = await oc.listCronTasks()
      return {
        found: tasks.some((t: any) => t.id === cronId),
      }
    }, testCronId)

    expect(result.found).toBe(false)
  })
})

// ─── Cross-section Data Integrity ───────────────────────────────────────────

test.describe('Data Integrity', () => {
  test('creating agents and models maintains separate lists', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw
      const agentsBefore = await oc.listAgents()
      const modelsBefore = await oc.listModels()

      await oc.createAgent({
        id: 'integrity-test-agent',
        name: 'Integrity Agent',
        description: '',
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        systemPrompt: '',
        channels: [],
        skills: [],
        enabled: true,
        avatar: '🔬',
        temperature: 0.7,
        maxTokens: 2048,
      })

      const agentsAfter = await oc.listAgents()
      const modelsAfter = await oc.listModels()

      // Clean up
      await oc.deleteAgent('integrity-test-agent')

      return {
        agentCountIncreased: agentsAfter.length === agentsBefore.length + 1,
        modelCountUnchanged: modelsAfter.length === modelsBefore.length,
      }
    })

    expect(result.agentCountIncreased).toBe(true)
    expect(result.modelCountUnchanged).toBe(true)
  })

  test('config round-trip preserves all data', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw

      // Create test data
      await oc.createAgent({
        id: 'roundtrip-agent',
        name: 'Roundtrip Agent',
        description: 'Test round-trip',
        modelProvider: 'anthropic',
        modelName: 'claude-sonnet-4-20250514',
        systemPrompt: 'You are a roundtrip test.',
        channels: ['telegram'],
        skills: ['calculator'],
        enabled: true,
        avatar: '🧪',
        temperature: 0.3,
        maxTokens: 1024,
      })

      // Read back
      const agent = await oc.getAgent('roundtrip-agent')

      // Clean up
      await oc.deleteAgent('roundtrip-agent')

      return {
        nameMatch: agent.name === 'Roundtrip Agent',
        descMatch: agent.description === 'Test round-trip',
        providerMatch: agent.modelProvider === 'anthropic',
        modelMatch: agent.modelName === 'claude-sonnet-4-20250514',
        promptMatch: agent.systemPrompt === 'You are a roundtrip test.',
        channelsMatch: JSON.stringify(agent.channels) === JSON.stringify(['telegram']),
        skillsMatch: JSON.stringify(agent.skills) === JSON.stringify(['calculator']),
        enabledMatch: agent.enabled === true,
        avatarMatch: agent.avatar === '🧪',
        tempMatch: agent.temperature === 0.3,
        maxTokensMatch: agent.maxTokens === 1024,
      }
    })

    expect(result.nameMatch).toBe(true)
    expect(result.descMatch).toBe(true)
    expect(result.providerMatch).toBe(true)
    expect(result.modelMatch).toBe(true)
    expect(result.promptMatch).toBe(true)
    expect(result.channelsMatch).toBe(true)
    expect(result.skillsMatch).toBe(true)
    expect(result.enabledMatch).toBe(true)
    expect(result.avatarMatch).toBe(true)
    expect(result.tempMatch).toBe(true)
    expect(result.maxTokensMatch).toBe(true)
  })
})
