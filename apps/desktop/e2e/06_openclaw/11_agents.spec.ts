/**
 * Agents E2E Tests
 *
 * Tests unified agent management (native + ACP runtime).
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

// ─── Agent Configuration CRUD ───────────────────────────────────────────────

test.describe('Agent Configuration CRUD', () => {
  const testAgentId = `e2e-agent-${Date.now()}`

  test('getAgents returns array with pre-configured agents', async () => {
    const agents = await page.evaluate(async () => {
      return await (window as any).desktopAPI.agents.getAgents()
    })

    expect(Array.isArray(agents)).toBe(true)
    expect(agents.length).toBeGreaterThan(0)

    // Check pre-configured agents exist
    const codex = agents.find((a: any) => a.acpAgentId === 'codex')
    expect(codex).toBeDefined()
    expect(codex.runtime).toBe('acp')
  })

  test('getAgentTemplates returns ACP agent templates', async () => {
    const templates = await page.evaluate(async () => {
      return await (window as any).desktopAPI.agents.getAgentTemplates()
    })

    expect(Array.isArray(templates)).toBe(true)
    expect(templates.length).toBeGreaterThan(0)

    // Check expected templates
    const codex = templates.find((t: any) => t.id === 'codex')
    expect(codex).toBeDefined()
    expect(codex.name).toBe('Codex')
    expect(codex.command).toContain('codex')
  })

  test('createAgent creates new ACP agent', async () => {
    const result = await page.evaluate(async () => {
      const agent = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Test Agent',
        enabled: false,
        runtime: 'acp',
        acpAgentId: 'claude',
        bindingMode: 'current-chat',
        sessionMode: 'persistent',
      })

      window.e2eTestAgentId = agent.id

      const agents = await (window as any).desktopAPI.agents.getAgents()
      return {
        created: agents.some((a: any) => a.id === agent.id),
        agentId: agent.id,
        name: agent.name,
        runtime: agent.runtime,
        acpAgentId: agent.acpAgentId,
      }
    })

    expect(result.created).toBe(true)
    expect(result.name).toBe('E2E Test Agent')
    expect(result.runtime).toBe('acp')
    expect(result.acpAgentId).toBe('claude')
  })

  test('created agent has correct configuration', async () => {
    const result = await page.evaluate(async () => {
      const agents = await (window as any).desktopAPI.agents.getAgents()
      const agent = agents.find((a: any) => a.id === window.e2eTestAgentId)

      return {
        found: !!agent,
        enabled: agent?.enabled,
        bindingMode: agent?.bindingMode,
        sessionMode: agent?.sessionMode,
      }
    })

    expect(result.found).toBe(true)
    expect(result.enabled).toBe(false)
    expect(result.bindingMode).toBe('current-chat')
    expect(result.sessionMode).toBe('persistent')
  })

  test('updateAgent modifies agent configuration', async () => {
    const result = await page.evaluate(async () => {
      const agentId = window.e2eTestAgentId

      await (window as any).desktopAPI.agents.updateAgent(agentId, {
        name: 'E2E Updated Agent',
        enabled: true,
        bindingMode: 'new-thread',
        sessionMode: 'oneshot',
      })

      const agents = await (window as any).desktopAPI.agents.getAgents()
      const updated = agents.find((a: any) => a.id === agentId)

      return {
        name: updated?.name,
        enabled: updated?.enabled,
        bindingMode: updated?.bindingMode,
        sessionMode: updated?.sessionMode,
      }
    })

    expect(result.name).toBe('E2E Updated Agent')
    expect(result.enabled).toBe(true)
    expect(result.bindingMode).toBe('new-thread')
    expect(result.sessionMode).toBe('oneshot')
  })

  test('setActiveAgent sets the active agent', async () => {
    const result = await page.evaluate(async () => {
      const agentId = window.e2eTestAgentId

      await (window as any).desktopAPI.agents.setActiveAgent(agentId)
      const active = await (window as any).desktopAPI.agents.getActiveAgent()

      return {
        success: true,
        activeAgentId: active?.id,
      }
    })

    expect(result.success).toBe(true)
    expect(result.activeAgentId).toBeTruthy()
  })

  test('getActiveAgent returns null when cleared', async () => {
    const result = await page.evaluate(async () => {
      await (window as any).desktopAPI.agents.setActiveAgent(null)
      const active = await (window as any).desktopAPI.agents.getActiveAgent()

      return {
        activeAgentId: active?.id ?? null,
      }
    })

    expect(result.activeAgentId).toBeNull()
  })

  test('deleteAgent removes the agent', async () => {
    const result = await page.evaluate(async () => {
      const agentId = window.e2eTestAgentId

      await (window as any).desktopAPI.agents.deleteAgent(agentId)
      const agents = await (window as any).desktopAPI.agents.getAgents()

      return {
        found: agents.some((a: any) => a.id === agentId),
      }
    })

    expect(result.found).toBe(false)
  })
})

// ─── Native Agent Support ───────────────────────────────────────────────────

test.describe('Native Agent Support', () => {
  test('createAgent supports native runtime', async () => {
    const result = await page.evaluate(async () => {
      const agent = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Native Agent',
        enabled: true,
        runtime: 'native',
        bindingMode: 'current-chat',
        sessionMode: 'persistent',
      })

      window.e2eNativeAgentId = agent.id

      return {
        agentId: agent.id,
        runtime: agent.runtime,
      }
    })

    expect(result.runtime).toBe('native')

    // Cleanup
    await page.evaluate(async () => {
      await (window as any).desktopAPI.agents.deleteAgent(window.e2eNativeAgentId)
    })
  })
})

// ─── Custom ACP Agent ───────────────────────────────────────────────────────

test.describe('Custom ACP Agent', () => {
  test('createAgent supports custom ACP command', async () => {
    const result = await page.evaluate(async () => {
      const agent = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Custom Agent',
        enabled: false,
        runtime: 'acp',
        acpAgentId: 'custom',
        acpCustomCommand: 'my-custom-agent --acp',
        bindingMode: 'current-chat',
        sessionMode: 'persistent',
      })

      window.e2eCustomAgentId = agent.id

      const command = await (window as any).desktopAPI.agents.getACPCommand(agent.id)

      return {
        agentId: agent.id,
        acpAgentId: agent.acpAgentId,
        acpCustomCommand: agent.acpCustomCommand,
        resolvedCommand: command,
      }
    })

    expect(result.acpAgentId).toBe('custom')
    expect(result.acpCustomCommand).toBe('my-custom-agent --acp')
    expect(result.resolvedCommand).toBe('my-custom-agent --acp')

    // Cleanup
    await page.evaluate(async () => {
      await (window as any).desktopAPI.agents.deleteAgent(window.e2eCustomAgentId)
    })
  })
})

// ─── ACP Command Resolution ─────────────────────────────────────────────────

test.describe('ACP Command Resolution', () => {
  test('getACPCommand returns command for pre-configured agent', async () => {
    const result = await page.evaluate(async () => {
      const agents = await (window as any).desktopAPI.agents.getAgents()
      const codex = agents.find((a: any) => a.acpAgentId === 'codex')

      if (!codex) return { error: 'Codex agent not found' }

      const command = await (window as any).desktopAPI.agents.getACPCommand(codex.id)
      return { command }
    })

    expect(result.command).toContain('codex')
  })

  test('getACPCommand returns null for native agent', async () => {
    const result = await page.evaluate(async () => {
      const agent = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Native For Command Test',
        enabled: false,
        runtime: 'native',
        bindingMode: 'current-chat',
        sessionMode: 'persistent',
      })

      const command = await (window as any).desktopAPI.agents.getACPCommand(agent.id)

      await (window as any).desktopAPI.agents.deleteAgent(agent.id)

      return { command }
    })

    expect(result.command).toBeNull()
  })
})

// ─── Agent Availability Check ───────────────────────────────────────────────

test.describe('Agent Availability Check', () => {
  test('checkAgent returns availability for ACP agent', async () => {
    const result = await page.evaluate(async () => {
      const agents = await (window as any).desktopAPI.agents.getAgents()
      const codex = agents.find((a: any) => a.acpAgentId === 'codex')

      if (!codex) return { skipped: true }

      const check = await (window as any).desktopAPI.agents.checkAgent(codex.id)
      return {
        hasAvailability: 'available' in check,
        available: check.available,
      }
    })

    if (result.skipped) return

    expect(result.hasAvailability).toBe(true)
    // Availability depends on whether npx is installed in test environment
    expect(typeof result.available).toBe('boolean')
  })

  test('checkAgent returns available for native agent', async () => {
    const result = await page.evaluate(async () => {
      const agent = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Native For Check',
        enabled: false,
        runtime: 'native',
        bindingMode: 'current-chat',
        sessionMode: 'persistent',
      })

      const check = await (window as any).desktopAPI.agents.checkAgent(agent.id)

      await (window as any).desktopAPI.agents.deleteAgent(agent.id)

      return {
        available: check.available,
      }
    })

    expect(result.available).toBe(true)
  })
})

// ─── Pre-configured Agents ──────────────────────────────────────────────────

test.describe('Pre-configured Agents', () => {
  test('pre-configured agents include Codex and Claude', async () => {
    const result = await page.evaluate(async () => {
      const agents = await (window as any).desktopAPI.agents.getAgents()

      const codex = agents.find((a: any) => a.acpAgentId === 'codex')
      const claude = agents.find((a: any) => a.acpAgentId === 'claude')

      return {
        hasCodex: !!codex,
        hasClaude: !!claude,
        codexEnabled: codex?.enabled,
        claudeEnabled: claude?.enabled,
      }
    })

    expect(result.hasCodex).toBe(true)
    expect(result.hasClaude).toBe(true)
    // Both should be enabled by default
    expect(result.codexEnabled).toBe(true)
    expect(result.claudeEnabled).toBe(true)
  })

  test('pre-configured agents have correct runtime and binding', async () => {
    const result = await page.evaluate(async () => {
      const agents = await (window as any).desktopAPI.agents.getAgents()
      const codex = agents.find((a: any) => a.acpAgentId === 'codex')

      return {
        runtime: codex?.runtime,
        bindingMode: codex?.bindingMode,
        sessionMode: codex?.sessionMode,
      }
    })

    expect(result.runtime).toBe('acp')
    expect(result.bindingMode).toBe('current-chat')
    expect(result.sessionMode).toBe('persistent')
  })
})

// ─── Multiple Agents ────────────────────────────────────────────────────────

test.describe('Multiple Agents', () => {
  test('can create multiple agents', async () => {
    const result = await page.evaluate(async () => {
      const agent1 = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Multi Agent 1',
        enabled: false,
        runtime: 'acp',
        acpAgentId: 'gemini',
        bindingMode: 'current-chat',
        sessionMode: 'persistent',
      })

      const agent2 = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Multi Agent 2',
        enabled: false,
        runtime: 'acp',
        acpAgentId: 'copilot',
        bindingMode: 'new-thread',
        sessionMode: 'oneshot',
      })

      window.e2eMultiAgentIds = [agent1.id, agent2.id]

      const agents = await (window as any).desktopAPI.agents.getAgents()
      const found1 = agents.some((a: any) => a.id === agent1.id)
      const found2 = agents.some((a: any) => a.id === agent2.id)

      return {
        count: agents.length,
        found1,
        found2,
      }
    })

    expect(result.found1).toBe(true)
    expect(result.found2).toBe(true)

    // Cleanup
    await page.evaluate(async () => {
      for (const id of window.e2eMultiAgentIds) {
        await (window as any).desktopAPI.agents.deleteAgent(id)
      }
    })
  })

  test('only one agent can be active at a time', async () => {
    const result = await page.evaluate(async () => {
      const agent1 = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Active Test 1',
        enabled: false,
        runtime: 'acp',
        acpAgentId: 'kimi',
        bindingMode: 'current-chat',
        sessionMode: 'persistent',
      })

      const agent2 = await (window as any).desktopAPI.agents.createAgent({
        name: 'E2E Active Test 2',
        enabled: false,
        runtime: 'acp',
        acpAgentId: 'qwen',
        bindingMode: 'current-chat',
        sessionMode: 'persistent',
      })

      window.e2eActiveTestIds = [agent1.id, agent2.id]

      // Set first agent active
      await (window as any).desktopAPI.agents.setActiveAgent(agent1.id)
      const active1 = await (window as any).desktopAPI.agents.getActiveAgent()

      // Set second agent active
      await (window as any).desktopAPI.agents.setActiveAgent(agent2.id)
      const active2 = await (window as any).desktopAPI.agents.getActiveAgent()

      // Cleanup
      await (window as any).desktopAPI.agents.setActiveAgent(null)
      for (const id of window.e2eActiveTestIds) {
        await (window as any).desktopAPI.agents.deleteAgent(id)
      }

      return {
        firstActiveId: active1?.id,
        secondActiveId: active2?.id,
      }
    })

    expect(result.firstActiveId).toBeTruthy()
    expect(result.secondActiveId).toBeTruthy()
    expect(result.firstActiveId).not.toBe(result.secondActiveId)
  })
})

// ─── Edge Cases ───────────────────────────────────────────────────────────────

test.describe('Edge Cases', () => {
  test('updateAgent with non-existent id returns null', async () => {
    const result = await page.evaluate(async () => {
      const updated = await (window as any).desktopAPI.agents.updateAgent('non-existent-id', {
        name: 'Should Not Update',
      })
      return { updated }
    })

    expect(result.updated).toBeNull()
  })

  test('deleteAgent with non-existent id returns false', async () => {
    const result = await page.evaluate(async () => {
      const deleted = await (window as any).desktopAPI.agents.deleteAgent('non-existent-id')
      return { deleted }
    })

    expect(result.deleted).toBe(false)
  })

  test('getAgent for non-existent id returns undefined', async () => {
    const result = await page.evaluate(async () => {
      const agents = await (window as any).desktopAPI.agents.getAgents()
      const found = agents.find((a: any) => a.id === 'non-existent-id')
      return { found }
    })

    expect(result.found).toBeUndefined()
  })
})

// TypeScript declarations for window
declare global {
  interface Window {
    e2eTestAgentId: string
    e2eNativeAgentId: string
    e2eCustomAgentId: string
    e2eMultiAgentIds: string[]
    e2eActiveTestIds: string[]
  }
}
