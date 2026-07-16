import { describe, expect, it, vi } from 'vitest'
import {
  compensateIncompleteConnectorBuddy,
  completeConnectorBuddyProvisioning,
} from '../src/main/services/connector-buddy-provisioning'

type TestJob = {
  id: string
  result?: Record<string, unknown> | null
}

type TestConnection = {
  agentId: string
  runtimeId: string
  computerId: string
  status: 'running' | 'stopped' | 'error'
}

const agent = {
  id: 'agent-1',
  config: {
    connectorComputerId: 'computer-1',
    connectorRuntimeId: 'codex',
  },
}

const job: TestJob = {
  id: 'job-1',
  result: { runtimeId: 'codex' },
}

const connection: TestConnection = {
  agentId: 'agent-1',
  runtimeId: 'codex',
  computerId: 'computer-1',
  status: 'running',
}

function provisioningInput(
  overrides: Partial<Parameters<typeof completeConnectorBuddyProvisioning>[0]> = {},
) {
  return {
    runtimeId: 'codex',
    computerId: 'computer-1',
    agent,
    job,
    waitForJob: vi.fn(async () => job),
    waitForConnections: vi.fn(async () => [connection]),
    describeConnectionFailure: vi.fn(async () => 'Codex did not come online.'),
    cleanupIncompleteBuddy: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('Connector Buddy compensation', () => {
  it('prefers the Connector delete route', async () => {
    const deleteConnectorBuddy = vi.fn(async () => undefined)
    const deleteAgent = vi.fn(async () => undefined)

    await expect(
      compensateIncompleteConnectorBuddy({ deleteConnectorBuddy, deleteAgent }),
    ).resolves.toBe('connector')
    expect(deleteConnectorBuddy).toHaveBeenCalledOnce()
    expect(deleteAgent).not.toHaveBeenCalled()
  })

  it('falls back to deleting the cloud Agent', async () => {
    const deleteConnectorBuddy = vi.fn(async () => {
      throw new Error('Connector route unavailable')
    })
    const deleteAgent = vi.fn(async () => undefined)

    await expect(
      compensateIncompleteConnectorBuddy({ deleteConnectorBuddy, deleteAgent }),
    ).resolves.toBe('agent')
    expect(deleteAgent).toHaveBeenCalledOnce()
  })

  it('preserves both cleanup errors when neither delete works', async () => {
    await expect(
      compensateIncompleteConnectorBuddy({
        deleteConnectorBuddy: async () => {
          throw new Error('binding delete failed')
        },
        deleteAgent: async () => {
          throw new Error('agent delete failed')
        },
      }),
    ).rejects.toThrow(
      'Connector cleanup failed: binding delete failed. Direct Buddy cleanup failed: agent delete failed',
    )
  })
})

describe('Connector Buddy provisioning', () => {
  it('only succeeds with the requested running runtime on the requested computer', async () => {
    const input = provisioningInput()

    await expect(completeConnectorBuddyProvisioning(input)).resolves.toEqual({
      agent,
      connections: [connection],
    })
    expect(input.cleanupIncompleteBuddy).not.toHaveBeenCalled()
  })

  it('cleans up and throws when the daemon job fails', async () => {
    const cleanupIncompleteBuddy = vi.fn(async () => undefined)
    const input = provisioningInput({
      waitForJob: vi.fn(async () => {
        throw new Error('Codex bridge failed to start')
      }),
      cleanupIncompleteBuddy,
    })

    await expect(completeConnectorBuddyProvisioning(input)).rejects.toThrow(
      'Buddy setup failed: Codex bridge failed to start. The incomplete Buddy was removed; you can retry safely.',
    )
    expect(cleanupIncompleteBuddy).toHaveBeenCalledWith('agent-1')
  })

  it('cleans up when no local connection is returned', async () => {
    const cleanupIncompleteBuddy = vi.fn(async () => undefined)
    const input = provisioningInput({
      waitForConnections: vi.fn(async () => []),
      cleanupIncompleteBuddy,
    })

    await expect(completeConnectorBuddyProvisioning(input)).rejects.toThrow(
      'The Connector did not return a local runtime binding for this Buddy.',
    )
    expect(cleanupIncompleteBuddy).toHaveBeenCalledWith('agent-1')
  })

  it('cleans up when the completed job reports a different runtime', async () => {
    const cleanupIncompleteBuddy = vi.fn(async () => undefined)
    const input = provisioningInput({
      waitForJob: vi.fn(async () => ({ id: 'job-1', result: { runtimeId: 'claude-code' } })),
      cleanupIncompleteBuddy,
    })

    await expect(completeConnectorBuddyProvisioning(input)).rejects.toThrow(
      'The Connector configured runtime "claude-code" instead of "codex".',
    )
    expect(cleanupIncompleteBuddy).toHaveBeenCalledWith('agent-1')
  })

  it('cleans up when the returned connection uses a different runtime', async () => {
    const cleanupIncompleteBuddy = vi.fn(async () => undefined)
    const input = provisioningInput({
      waitForConnections: vi.fn(async () => [{ ...connection, runtimeId: 'claude-code' }]),
      cleanupIncompleteBuddy,
    })

    await expect(completeConnectorBuddyProvisioning(input)).rejects.toThrow(
      'The Connector returned runtime "claude-code" instead of "codex".',
    )
    expect(cleanupIncompleteBuddy).toHaveBeenCalledWith('agent-1')
  })

  it('uses connection diagnostics before cleaning up a non-running Buddy', async () => {
    const cleanupIncompleteBuddy = vi.fn(async () => undefined)
    const describeConnectionFailure = vi.fn(async () => 'Codex process exited before login.')
    const input = provisioningInput({
      waitForConnections: vi.fn(async () => [{ ...connection, status: 'error' as const }]),
      describeConnectionFailure,
      cleanupIncompleteBuddy,
    })

    await expect(completeConnectorBuddyProvisioning(input)).rejects.toThrow(
      'Buddy setup failed: Codex process exited before login.',
    )
    expect(describeConnectionFailure).toHaveBeenCalledOnce()
    expect(cleanupIncompleteBuddy).toHaveBeenCalledWith('agent-1')
  })

  it('reports when automatic cleanup also fails', async () => {
    const input = provisioningInput({
      waitForConnections: vi.fn(async () => []),
      cleanupIncompleteBuddy: vi.fn(async () => {
        throw new Error('both delete routes failed')
      }),
    })

    await expect(completeConnectorBuddyProvisioning(input)).rejects.toThrow(
      'Automatic cleanup also failed: both delete routes failed. Remove the incomplete Buddy from Shadow before retrying.',
    )
  })
})
