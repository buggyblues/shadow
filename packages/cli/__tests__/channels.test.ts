import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    sendMessage: vi.fn(),
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

import { CHANNEL_SEND_DISABLED_ENV, createChannelsCommand } from '../src/commands/channels.js'

async function runChannelsCommand(args: string[]) {
  const command = createChannelsCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'channels', ...args], { from: 'node' })
}

describe('channels command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env[CHANNEL_SEND_DISABLED_ENV]
  })

  afterEach(() => {
    delete process.env[CHANNEL_SEND_DISABLED_ENV]
    vi.restoreAllMocks()
  })

  it('sends channel messages through the API client by default', async () => {
    const result = { id: 'message-1', content: 'Hello' }
    mocks.client.sendMessage.mockResolvedValue(result)

    await runChannelsCommand([
      'send',
      'channel-1',
      '--content',
      'Hello',
      '--reply-to',
      'parent-1',
      '--json',
    ])

    expect(mocks.client.sendMessage).toHaveBeenCalledWith('channel-1', 'Hello', {
      replyToId: 'parent-1',
      threadId: undefined,
    })
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })

  it('blocks direct channel sends when the runtime disables the side channel', async () => {
    process.env[CHANNEL_SEND_DISABLED_ENV] = '1'
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`exit:${code}`)
    })

    await expect(
      runChannelsCommand(['send', 'channel-1', '--content', 'Blocked', '--json']),
    ).rejects.toThrow('exit:1')

    expect(mocks.getClient).not.toHaveBeenCalled()
    expect(mocks.client.sendMessage).not.toHaveBeenCalled()
    expect(mocks.outputError).toHaveBeenCalledWith(expect.stringContaining('disabled'), {
      json: true,
    })
  })
})
