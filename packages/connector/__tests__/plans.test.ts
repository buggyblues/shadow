import { describe, expect, it } from 'vitest'
import { createConnectorPlan, createConnectorPlans } from '../src'

describe('connector plans', () => {
  it('builds an OpenClaw one-line setup command', () => {
    const plan = createConnectorPlan({
      target: 'openclaw',
      serverUrl: 'https://shadow.example.com/api',
      token: 'tok',
    })

    expect(plan.quickCommand).toContain('openclaw plugins install @shadowob/openclaw-shadowob')
    expect(plan.connectCommand).toContain('@shadowob/connector@latest connect')
    expect(plan.quickCommand).toContain("channels.shadowob.token 'tok'")
    expect(plan.configBlocks[0]?.content).toContain('"serverUrl": "https://shadow.example.com"')
    expect(plan.summary).toContain('Shadow CLI bin/skills')
    expect(plan.aiPrompt).toContain('official Shadow skill files')
  })

  it('builds a Hermes plugin env and config plan', () => {
    const plan = createConnectorPlan({
      target: 'hermes',
      serverUrl: 'http://localhost:3000',
      token: 'tok',
    })

    expect(plan.quickCommand).toContain('~/.hermes/plugins/shadowob')
    expect(plan.connectCommand).toContain('--target hermes')
    expect(plan.connectCommand).not.toContain('--agent-id')
    expect(plan.connectCommand).not.toContain('--channel-id')
    expect(
      plan.configBlocks.find((block) => block.label === '~/.hermes/.env')?.content,
    ).not.toContain('SHADOW_CHANNEL_IDS')
    expect(
      plan.configBlocks.find((block) => block.label === '~/.hermes/.env')?.content,
    ).not.toContain('SHADOW_AGENT_ID')
    expect(plan.configBlocks.find((block) => block.language === 'yaml')?.content).toContain(
      'platforms:',
    )
    expect(plan.aiPrompt).toContain('resolves the Buddy agent id and channel policy')
    expect(plan.aiPrompt).toContain('official Shadow skill files')
    expect(plan.capabilities).toContain('slashCommands')
    expect(plan.capabilities).toContain('activityStatus')
    expect(plan.capabilities).toContain('statusChecks')
    expect(plan.capabilities).toContain('usageCosts')
  })

  it('builds cc-connect TOML with ShadowOB platform options', () => {
    const plan = createConnectorPlan({
      target: 'cc-connect',
      serverUrl: 'https://shadow.example.com',
      token: 'tok',
      workDir: '/work/shadow',
      agentType: 'codex',
    })

    expect(plan.configBlocks[0]?.content).toContain('type = "shadowob"')
    expect(plan.connectCommand).toContain('--target cc-connect')
    expect(plan.connectCommand).toContain('--install --start')
    expect(plan.quickCommand).not.toContain('npm install -g cc-connect')
    expect(plan.summary).toContain('buggyblues/cc-connect@63b5d59')
    expect(plan.summary).toContain('Shadow CLI bin/skills')
    expect(plan.configBlocks[0]?.content).toContain('[projects.agent]')
    expect(plan.configBlocks[0]?.content).toContain('type = "codex"')
    expect(plan.configBlocks[0]?.content).toContain('server_url = "https://shadow.example.com"')
    expect(plan.configBlocks[0]?.content).toContain('work_dir = "/work/shadow"')
    expect(plan.capabilities).toContain('multiAgentBinding')
    expect(plan.capabilities).toContain('notifications')
  })

  it('returns all supported plans in stable order', () => {
    expect(
      createConnectorPlans({ serverUrl: 'https://shadowob.com', token: 'tok' }).map(
        (p) => p.target,
      ),
    ).toEqual(['openclaw', 'hermes', 'cc-connect'])
  })

  it('documents all connector targets in one-line commands', () => {
    const plans = createConnectorPlans({ serverUrl: 'https://shadowob.com', token: 'tok' })

    expect(plans.find((plan) => plan.target === 'openclaw')?.connectCommand).toContain(
      '--target openclaw',
    )
    expect(plans.find((plan) => plan.target === 'hermes')?.connectCommand).toContain(
      '--target hermes',
    )
    expect(plans.find((plan) => plan.target === 'cc-connect')?.connectCommand).toContain(
      '--target cc-connect',
    )
  })
})
