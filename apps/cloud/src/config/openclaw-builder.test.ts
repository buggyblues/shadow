import { describe, expect, it } from 'vitest'
import { buildOpenClawConfig } from './openclaw-builder.js'
import type { AgentDeployment, CloudConfig } from './schema.js'

describe('buildOpenClawConfig', () => {
  it('does not leak Shadow permission-only fields into OpenClaw tools config', () => {
    const agent: AgentDeployment = {
      id: 'app-maker',
      runtime: 'openclaw',
      configuration: {},
      permissions: {
        default: 'always-allow',
        nonInteractive: 'fail',
      },
    }
    const config: CloudConfig = {
      version: '1',
      deployments: {
        backend: 'deployment',
        agents: [agent],
      },
    }

    const openclawConfig = buildOpenClawConfig(agent, config)

    expect(openclawConfig.tools).toEqual({ profile: 'full' })
  })

  it('normalizes stale OpenClaw tools fragments from older templates', () => {
    const agent: AgentDeployment = {
      id: 'app-maker',
      runtime: 'openclaw',
      configuration: {
        openclaw: {
          tools: {
            profile: 'approve-reads',
            nonInteractive: 'fail',
          } as never,
        },
      },
    }
    const config: CloudConfig = {
      version: '1',
      deployments: {
        backend: 'deployment',
        agents: [agent],
      },
    }

    const openclawConfig = buildOpenClawConfig(agent, config)

    expect(openclawConfig.tools).toEqual({ profile: 'full' })
  })
})
