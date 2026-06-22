import { describe, expect, it } from 'vitest'
import {
  listEphemeralRuntimeStateTargets,
  resolveRuntimeStateTarget,
  runtimeStatePvcNameForAgent,
} from '../src/lib/cloud-runtime-state'

describe('cloud runtime state targeting', () => {
  it('resolves Hermes runtime state paths and marks deployment backend as persistent by default', () => {
    const deployment = {
      name: 'hermes-buddy',
      configSnapshot: {
        deployments: {
          backend: 'deployment',
          agents: [{ id: 'hermes-buddy', runtime: 'hermes' }],
        },
      },
    }

    expect(resolveRuntimeStateTarget(deployment)).toMatchObject({
      agentId: 'hermes-buddy',
      runtime: 'hermes',
      containerName: 'hermes',
      statePath: '/home/shadow/.hermes',
      pvcName: 'shadow-runner-state-hermes-buddy',
      backend: 'deployment',
      persistentState: true,
    })
    expect(listEphemeralRuntimeStateTargets(deployment)).toEqual([])
  })

  it('uses the shared runner state PVC name for persistent agent-sandbox state', () => {
    const deployment = {
      name: 'agent-1',
      configSnapshot: {
        deployments: {
          backend: 'agent-sandbox',
          agents: [{ id: 'agent-1', runtime: 'openclaw' }],
        },
      },
    }

    expect(runtimeStatePvcNameForAgent('agent-1')).toBe('shadow-runner-state-agent-1')
    expect(resolveRuntimeStateTarget(deployment)).toMatchObject({
      agentId: 'agent-1',
      containerName: 'openclaw',
      statePath: '/home/shadow/.openclaw',
      pvcName: 'shadow-runner-state-agent-1',
      persistentState: true,
    })
    expect(listEphemeralRuntimeStateTargets(deployment)).toEqual([])
  })

  it('honors state opt-out as ephemeral', () => {
    const deployment = {
      name: 'agent-1',
      configSnapshot: {
        deployments: {
          backend: 'deployment',
          sandbox: { state: { enabled: false } },
          agents: [{ id: 'agent-1', runtime: 'cc-connect' }],
        },
      },
    }

    expect(resolveRuntimeStateTarget(deployment)).toMatchObject({
      containerName: 'cc-connect',
      statePath: '/home/shadow/.cc-connect',
      persistentState: false,
    })
  })
})
