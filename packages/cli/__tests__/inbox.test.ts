import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    approveBuddyInboxAdmissionPending: vi.fn(),
    enqueueInboxTask: vi.fn(),
    enqueueInboxTaskForAgent: vi.fn(),
    listBuddyInboxAdmissionPending: vi.fn(),
    rejectBuddyInboxAdmissionPending: vi.fn(),
  }
  return {
    client,
    getClient: vi.fn(async () => client),
    output: vi.fn(),
    outputError: vi.fn(),
  }
})

vi.mock('../src/utils/client.js', () => ({
  getClient: mocks.getClient,
  parsePositiveInt: (value: string) => Number.parseInt(value, 10),
  resolveServerFlag: (value?: string) => {
    if (!value) throw new Error('Missing server')
    return value
  },
}))

vi.mock('../src/utils/output.js', () => ({
  output: mocks.output,
  outputError: mocks.outputError,
}))

import { createInboxCommand } from '../src/commands/inbox.js'

async function runInboxCommand(args: string[]) {
  const command = createInboxCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'inbox', ...args], { from: 'node' })
}

describe('inbox command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SHADOWOB_PARENT_TASK_JSON
    delete process.env.SHADOW_PARENT_TASK_JSON
    delete process.env.SHADOWOB_PARENT_TASK_MESSAGE_ID
    delete process.env.SHADOWOB_PARENT_TASK_CARD_ID
    delete process.env.SHADOWOB_PARENT_TASK_CHANNEL_ID
    delete process.env.SHADOWOB_PARENT_TASK_THREAD_ID
    delete process.env.SHADOWOB_TASK_MESSAGE_ID
    delete process.env.SHADOWOB_TASK_CARD_ID
    delete process.env.SHADOWOB_TASK_CHANNEL_ID
    delete process.env.SHADOWOB_TASK_THREAD_ID
  })

  it('lists pending Inbox admissions', async () => {
    const result = { channel: { id: 'channel-1' }, pending: [{ id: 'pending-1' }] }
    mocks.client.listBuddyInboxAdmissionPending.mockResolvedValue(result)

    await runInboxCommand([
      'pending',
      'list',
      '--server',
      'shadow-plays',
      '--agent',
      'agent-1',
      '--json',
    ])

    expect(mocks.client.listBuddyInboxAdmissionPending).toHaveBeenCalledWith(
      'shadow-plays',
      'agent-1',
    )
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })

  it('enqueues Inbox tasks with top-level task extensions', async () => {
    const result = { id: 'message-1', channelId: 'channel-1' }
    mocks.client.enqueueInboxTaskForAgent.mockResolvedValue(result)

    await runInboxCommand([
      'enqueue',
      '--server',
      'shadow-plays',
      '--agent',
      'agent-1',
      '--title',
      'Render workspace artifact',
      '--requirements-json',
      '{"capabilities":["workspace.write"],"skills":[{"kind":"runtime-skill","package":"@shadow/skills-media"}]}',
      '--output-contract-json',
      '{"expectedArtifacts":[{"kind":"workspace.file","mimeTypes":["video/mp4"]}],"submitCommand":{"appKey":"kanban","command":"cards.artifacts.add"}}',
      '--privacy-json',
      '{"dataClass":"server-private","redactionRequired":true}',
      '--json',
    ])

    expect(mocks.client.enqueueInboxTaskForAgent).toHaveBeenCalledWith(
      'shadow-plays',
      'agent-1',
      expect.objectContaining({
        title: 'Render workspace artifact',
        requirements: expect.objectContaining({
          capabilities: ['workspace.write'],
          skills: [
            expect.objectContaining({
              kind: 'runtime-skill',
              package: '@shadow/skills-media',
            }),
          ],
        }),
        outputContract: expect.objectContaining({
          submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
        }),
        privacy: { dataClass: 'server-private', redactionRequired: true },
      }),
    )
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })

  it('enqueues Inbox tasks with explicit parent task context', async () => {
    const result = { id: 'message-1', channelId: 'channel-1' }
    mocks.client.enqueueInboxTaskForAgent.mockResolvedValue(result)

    await runInboxCommand([
      'enqueue',
      '--server',
      'shadow-plays',
      '--agent',
      'agent-1',
      '--title',
      'Run delegated review',
      '--parent-task-json',
      '{"messageId":"parent-message","cardId":"parent-card","channelId":"parent-channel","threadId":"parent-thread","title":"Parent task"}',
      '--json',
    ])

    expect(mocks.client.enqueueInboxTaskForAgent).toHaveBeenCalledWith(
      'shadow-plays',
      'agent-1',
      expect.objectContaining({
        title: 'Run delegated review',
        data: {
          task: {
            parentTask: {
              messageId: 'parent-message',
              cardId: 'parent-card',
              channelId: 'parent-channel',
              threadId: 'parent-thread',
              title: 'Parent task',
            },
          },
        },
      }),
    )
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })

  it('enqueues Inbox tasks with parent task context from the environment', async () => {
    const result = { id: 'message-1', channelId: 'channel-1' }
    mocks.client.enqueueInboxTaskForAgent.mockResolvedValue(result)
    process.env.SHADOWOB_PARENT_TASK_JSON =
      '{"messageId":"parent-message","cardId":"parent-card","channelId":"parent-channel","threadId":"parent-thread"}'

    await runInboxCommand([
      'enqueue',
      '--server',
      'shadow-plays',
      '--agent',
      'agent-1',
      '--title',
      'Run delegated review',
      '--data-json',
      '{"task":{"context":"keep-me"},"custom":true}',
      '--json',
    ])

    expect(mocks.client.enqueueInboxTaskForAgent).toHaveBeenCalledWith(
      'shadow-plays',
      'agent-1',
      expect.objectContaining({
        data: {
          custom: true,
          task: {
            context: 'keep-me',
            parentTask: {
              messageId: 'parent-message',
              cardId: 'parent-card',
              channelId: 'parent-channel',
              threadId: 'parent-thread',
            },
          },
        },
      }),
    )
  })

  it('approves pending Inbox admissions', async () => {
    const result = { pending: { id: 'pending-1' }, message: { id: 'message-1' } }
    mocks.client.approveBuddyInboxAdmissionPending.mockResolvedValue(result)

    await runInboxCommand([
      'pending',
      'approve',
      'pending-1',
      '--server',
      'shadow-plays',
      '--agent',
      'agent-1',
      '--json',
    ])

    expect(mocks.client.approveBuddyInboxAdmissionPending).toHaveBeenCalledWith(
      'shadow-plays',
      'agent-1',
      'pending-1',
    )
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })

  it('rejects pending Inbox admissions', async () => {
    const result = { pending: { id: 'pending-1' } }
    mocks.client.rejectBuddyInboxAdmissionPending.mockResolvedValue(result)

    await runInboxCommand([
      'pending',
      'reject',
      'pending-1',
      '--server',
      'shadow-plays',
      '--agent',
      'agent-1',
      '--json',
    ])

    expect(mocks.client.rejectBuddyInboxAdmissionPending).toHaveBeenCalledWith(
      'shadow-plays',
      'agent-1',
      'pending-1',
    )
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
  })
})
