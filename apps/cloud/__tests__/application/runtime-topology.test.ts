import { beforeEach, describe, expect, it } from 'vitest'
import {
  planRuntimeTopology,
  resolveRuntimeTarget,
} from '../../src/application/runtime-topology.js'
import type { AgentDeployment, AgentRuntime, CloudConfig } from '../../src/config/schema.js'
import agentPackPlugin from '../../src/plugins/agent-pack/index.js'
import { getPluginRegistry, resetPluginRegistry } from '../../src/plugins/registry.js'
import skillsPlugin from '../../src/plugins/skills/index.js'

beforeEach(() => {
  resetPluginRegistry()
})

function agent(id: string, runtime: AgentRuntime, extra: Partial<AgentDeployment> = {}) {
  return {
    id,
    runtime,
    configuration: {},
    ...extra,
  } satisfies AgentDeployment
}

function config(agents: AgentDeployment[], deployments: Partial<CloudConfig['deployments']> = {}) {
  return {
    version: '1',
    deployments: {
      agents,
      ...deployments,
    },
  } satisfies CloudConfig
}

describe('planRuntimeTopology', () => {
  it('keeps every runtime dedicated by default', () => {
    const topology = planRuntimeTopology(
      config([
        agent('openclaw-a', 'openclaw'),
        agent('codex-a', 'codex'),
        agent('hermes-a', 'hermes'),
      ]),
    )

    expect(topology.executionUnits.map((unit) => unit.id)).toEqual([
      'openclaw-a',
      'codex-a',
      'hermes-a',
    ])
    expect(topology.executionUnits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'openclaw-a',
          runtimeKind: 'openclaw',
          packageMode: 'single-agent',
          shared: false,
        }),
        expect.objectContaining({
          id: 'codex-a',
          runtimeKind: 'cc-connect',
          packageMode: 'single-agent',
          shared: false,
        }),
        expect.objectContaining({
          id: 'hermes-a',
          runtimeKind: 'hermes',
          packageMode: 'single-agent',
          shared: false,
        }),
      ]),
    )
  })

  it('plans an explicit shared OpenClaw execution unit', () => {
    const topology = planRuntimeTopology(
      config([agent('reviewer', 'openclaw'), agent('writer', 'openclaw')], {
        placement: {
          groups: [{ id: 'openclaw-main', agentIds: ['reviewer', 'writer'] }],
        },
      }),
    )

    expect(topology.executionUnits).toEqual([
      expect.objectContaining({
        id: 'openclaw-main',
        runtime: 'openclaw',
        runtimeKind: 'openclaw',
        packageMode: 'multi-agent',
        isolation: 'shared-runner',
        agentIds: ['reviewer', 'writer'],
        statePvcName: 'shadow-runner-state-openclaw-main',
        shared: true,
      }),
    ])
    expect(topology.agentToExecutionUnit).toEqual({
      reviewer: 'openclaw-main',
      writer: 'openclaw-main',
    })
  })

  it('plans an explicit shared cc-connect execution unit for same-runtime agents', () => {
    const topology = planRuntimeTopology(
      config([agent('coder-a', 'codex'), agent('coder-b', 'codex')], {
        placement: {
          groups: [{ id: 'codex-team', agentIds: ['coder-a', 'coder-b'] }],
        },
      }),
    )

    expect(topology.executionUnits).toEqual([
      expect.objectContaining({
        id: 'codex-team',
        runtime: 'codex',
        runtimeKind: 'cc-connect',
        packageMode: 'multi-agent',
        agentIds: ['coder-a', 'coder-b'],
        shared: true,
      }),
    ])
  })

  it('plans an explicit shared Hermes execution unit', () => {
    const topology = planRuntimeTopology(
      config([agent('researcher', 'hermes'), agent('operator', 'hermes')], {
        placement: {
          groups: [{ id: 'hermes-team', agentIds: ['researcher', 'operator'] }],
        },
      }),
    )

    expect(topology.executionUnits).toEqual([
      expect.objectContaining({
        id: 'hermes-team',
        runtime: 'hermes',
        runtimeKind: 'hermes',
        packageMode: 'multi-agent',
        agentIds: ['researcher', 'operator'],
        shared: true,
      }),
    ])
  })

  it('records a compatibility downgrade instead of silently sharing incompatible agents', () => {
    const topology = planRuntimeTopology(
      config([agent('claude-a', 'claude-code'), agent('codex-a', 'codex')], {
        placement: {
          groups: [{ id: 'mixed-cc', agentIds: ['claude-a', 'codex-a'] }],
        },
      }),
    )

    expect(topology.executionUnits).toHaveLength(2)
    expect(topology.executionUnits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'claude-a',
          packageMode: 'single-agent',
          shared: false,
          compatibility: expect.objectContaining({
            accepted: false,
            reason: 'runner image differs across agents',
          }),
        }),
        expect.objectContaining({
          id: 'codex-a',
          packageMode: 'single-agent',
          shared: false,
          compatibility: expect.objectContaining({
            accepted: false,
            reason: 'runner image differs across agents',
          }),
        }),
      ]),
    )
  })

  it('auto groups compatible agents when shared-runner is requested', () => {
    const topology = planRuntimeTopology(
      config([agent('writer-a', 'openclaw'), agent('writer-b', 'openclaw')], {
        placement: {
          mode: 'auto',
          defaultIsolation: 'shared-runner',
        },
      }),
    )

    expect(topology.executionUnits).toEqual([
      expect.objectContaining({
        id: 'openclaw-shared',
        agentIds: ['writer-a', 'writer-b'],
        packageMode: 'multi-agent',
      }),
    ])
  })

  it('downgrades shared groups that use pod-level per-agent plugins', () => {
    getPluginRegistry().register(agentPackPlugin)
    const topology = planRuntimeTopology(
      config(
        [
          agent('writer-a', 'openclaw', {
            use: [{ plugin: 'agent-pack', options: { packs: [] } }],
          }),
          agent('writer-b', 'openclaw'),
        ],
        {
          placement: {
            groups: [{ id: 'writers', agentIds: ['writer-a', 'writer-b'] }],
          },
        },
      ),
    )

    expect(topology.executionUnits).toHaveLength(2)
    expect(topology.executionUnits[0]!.compatibility).toEqual({
      accepted: false,
      reason: 'agent writer-a uses pod-level plugin agent-pack',
    })
  })

  it('allows skills plugin runtime assets in an explicit shared execution unit', () => {
    getPluginRegistry().register(skillsPlugin)
    const topology = planRuntimeTopology(
      config(
        [
          agent('writer-a', 'openclaw', {
            use: [
              {
                plugin: 'skills',
                options: { install: [{ package: 'owner/pack', skills: ['outline'] }] },
              },
            ],
          }),
          agent('writer-b', 'openclaw', {
            use: [
              {
                plugin: 'skills',
                options: { install: [{ package: 'owner/pack', skills: ['edit'] }] },
              },
            ],
          }),
        ],
        {
          placement: {
            groups: [{ id: 'writers', agentIds: ['writer-a', 'writer-b'] }],
          },
        },
      ),
    )

    expect(topology.executionUnits).toEqual([
      expect.objectContaining({
        id: 'writers',
        agentIds: ['writer-a', 'writer-b'],
        packageMode: 'multi-agent',
        shared: true,
        compatibility: { accepted: true },
      }),
    ])
  })
})

describe('resolveRuntimeTarget', () => {
  it('maps a logical agent id to the execution unit runtime target', () => {
    const topology = planRuntimeTopology(
      config([agent('reviewer', 'openclaw'), agent('writer', 'openclaw')], {
        placement: {
          groups: [{ id: 'openclaw-main', agentIds: ['reviewer', 'writer'] }],
        },
      }),
    )

    expect(resolveRuntimeTarget(topology, 'writer')).toEqual({
      requestedAgentId: 'writer',
      executionUnitId: 'openclaw-main',
      affectedAgentIds: ['reviewer', 'writer'],
      sandboxName: 'openclaw-main',
      serviceName: 'openclaw-main-svc',
      statePvcName: 'shadow-runner-state-openclaw-main',
      scope: 'execution-unit',
    })
  })
})
