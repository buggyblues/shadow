import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    grantServerAppToBuddy: vi.fn(),
  }
  return {
    client,
    getClient: vi.fn(async () => client),
    output: vi.fn(),
    outputError: vi.fn(),
    outputSuccess: vi.fn(),
  }
})

vi.mock('../src/utils/client.js', () => ({
  getClient: mocks.getClient,
  resolveServerFlag: (value?: string) => {
    if (!value) throw new Error('Missing server')
    return value
  },
}))

vi.mock('../src/utils/output.js', () => ({
  output: mocks.output,
  outputError: mocks.outputError,
  outputSuccess: mocks.outputSuccess,
}))

import { BUDDY_INBOX_DELIVERY_PERMISSION } from '@shadowob/sdk'
import { createAppCommand } from '../src/commands/app.js'

async function runAppCommand(args: string[]) {
  const command = createAppCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'app', ...args], { from: 'node' })
}

describe('app command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the Inbox delivery platform permission through Buddy grants', async () => {
    const result = { id: 'grant-1' }
    mocks.client.grantServerAppToBuddy.mockResolvedValue(result)

    await runAppCommand([
      'grant',
      'demo-desk',
      '--server',
      'shadow-plays',
      '--buddy',
      'agent-1',
      '--permissions',
      `${BUDDY_INBOX_DELIVERY_PERMISSION},demo.tickets:read`,
      '--json',
    ])

    expect(mocks.client.grantServerAppToBuddy).toHaveBeenCalledWith('shadow-plays', 'demo-desk', {
      buddyAgentId: 'agent-1',
      permissions: [BUDDY_INBOX_DELIVERY_PERMISSION, 'demo.tickets:read'],
      approvalMode: 'none',
    })
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })
})
