import { describe, expect, it } from 'vitest'
import { ShadowBridge, type ShadowBridgeCommandSpec } from '../src/bridge'

type PostedMessage = {
  message: Record<string, unknown>
  targetOrigin: string
}

function createBridgeWindow() {
  const listeners = new Set<(event: MessageEvent) => void>()
  const posted: PostedMessage[] = []
  const storage = new Map<string, string>()
  const sessionStorage = {
    get length() {
      return storage.size
    },
    clear() {
      storage.clear()
    },
    getItem(key: string) {
      return storage.get(key) ?? null
    },
    key(index: number) {
      return Array.from(storage.keys())[index] ?? null
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
  } as Storage
  const parent = {
    postMessage(message: unknown, targetOrigin: string) {
      posted.push({ message: message as Record<string, unknown>, targetOrigin })
    },
  }
  const win = {
    location: { search: '?shadow_launch=test-launch' },
    parent,
    sessionStorage,
    addEventListener(type: string, callback: (event: MessageEvent) => void) {
      if (type === 'message') listeners.add(callback)
    },
    removeEventListener(type: string, callback: (event: MessageEvent) => void) {
      if (type === 'message') listeners.delete(callback)
    },
    setTimeout() {
      return 0
    },
  } as unknown as Window

  return {
    posted,
    win,
    respond(message: Record<string, unknown>) {
      for (const listener of listeners) listener({ data: message } as MessageEvent)
    },
  }
}

describe('ShadowBridge', () => {
  it('calls typed commands and unwraps command protocol payloads', async () => {
    type Commands = {
      'cards.dispatch': ShadowBridgeCommandSpec<
        { cardId: string; assigneeLabel: string },
        { card: { id: string; title: string } }
      >
    }
    const fixture = createBridgeWindow()
    const bridge = new ShadowBridge<Commands>({
      appKey: 'kanban',
      targetOrigin: 'https://shadow.local',
      windowRef: fixture.win,
    })

    const resultPromise = bridge.command('cards.dispatch', {
      cardId: 'card-1',
      assigneeLabel: 'Strategy Buddy',
    })

    expect(fixture.posted).toHaveLength(1)
    expect(fixture.posted[0]?.targetOrigin).toBe('https://shadow.local')
    expect(fixture.posted[0]?.message).toMatchObject({
      appKey: 'kanban',
      type: ShadowBridge.commandRequestType,
      commandName: 'cards.dispatch',
      input: { cardId: 'card-1', assigneeLabel: 'Strategy Buddy' },
    })

    fixture.respond({
      type: ShadowBridge.commandResponseType,
      requestId: fixture.posted[0]?.message.requestId,
      ok: true,
      result: {
        ok: true,
        result: {
          card: { id: 'card-1', title: 'Review launch' },
          shadow: {
            protocol: 'shadow.app/1',
            outbox: {
              deliveries: [{ channelId: 'channel-1', messageId: 'message-1' }],
            },
          },
        },
      },
    })

    const result = await resultPromise
    expect(result.card.title).toBe('Review launch')
    expect(bridge.inboxDeliveries(result)).toEqual([
      { channelId: 'channel-1', messageId: 'message-1' },
    ])
  })

  it('loads Buddy inboxes and enqueues task cards through bridge messages', async () => {
    const fixture = createBridgeWindow()
    const bridge = new ShadowBridge({ appKey: 'skills', windowRef: fixture.win })

    const capabilitiesPromise = bridge.capabilities()
    expect(fixture.posted[0]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.capabilitiesRequestType,
    })
    fixture.respond({
      type: ShadowBridge.capabilitiesResponseType,
      requestId: fixture.posted[0]?.message.requestId,
      ok: true,
      result: {
        capabilities: [
          'command.call',
          'inbox.list',
          'inbox.task.enqueue',
          'copilot.open',
          'workspace.open',
        ],
      },
    })
    await expect(capabilitiesPromise).resolves.toEqual({
      capabilities: [
        'command.call',
        'inbox.list',
        'inbox.task.enqueue',
        'copilot.open',
        'workspace.open',
      ],
    })

    const inboxesPromise = bridge.inboxes()
    expect(fixture.posted[1]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.inboxesRequestType,
    })
    fixture.respond({
      type: ShadowBridge.inboxesResponseType,
      requestId: fixture.posted[1]?.message.requestId,
      ok: true,
      result: {
        inboxes: [
          {
            agent: { id: 'agent-1' },
            channel: { id: 'channel-1', name: 'inbox-agent-1' },
          },
        ],
      },
    })
    const inboxes = await inboxesPromise
    expect(inboxes.inboxes[0]?.agent.id).toBe('agent-1')

    const enqueuePromise = bridge.enqueueInboxTask({
      target: { channelId: 'channel-1' },
      task: {
        title: 'Install grill-me',
        body: 'Download the skill zip and install it.',
        resource: { kind: 'skill.package', id: 'grill-me' },
        requirements: {
          capabilities: ['workspace.write'],
          skills: [{ kind: 'runtime-skill', package: '@shadow/skills-video' }],
        },
        outputContract: {
          expectedArtifacts: [{ kind: 'workspace.file', mimeTypes: ['video/mp4'] }],
          submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
        },
        privacy: { dataClass: 'server-private', redactionRequired: true },
      },
    })
    expect(fixture.posted[2]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.enqueueInboxTaskRequestType,
      target: { channelId: 'channel-1' },
      task: {
        title: 'Install grill-me',
        resource: { kind: 'skill.package', id: 'grill-me' },
        requirements: {
          capabilities: ['workspace.write'],
          skills: [{ kind: 'runtime-skill', package: '@shadow/skills-video' }],
        },
        outputContract: {
          expectedArtifacts: [{ kind: 'workspace.file', mimeTypes: ['video/mp4'] }],
          submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
        },
        privacy: { dataClass: 'server-private', redactionRequired: true },
      },
    })
    fixture.respond({
      type: ShadowBridge.enqueueInboxTaskResponseType,
      requestId: fixture.posted[2]?.message.requestId,
      ok: true,
      result: {
        channelId: 'channel-1',
        messageId: 'message-2',
        cardId: 'task-card-1',
      },
    })

    await expect(enqueuePromise).resolves.toEqual({
      channelId: 'channel-1',
      messageId: 'message-2',
      cardId: 'task-card-1',
    })

    const openPromise = bridge.openCopilot({
      channelId: 'channel-1',
      messageId: 'message-2',
      cardId: 'task-card-1',
    })
    expect(fixture.posted[3]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.openCopilotRequestType,
      delivery: {
        channelId: 'channel-1',
        messageId: 'message-2',
        cardId: 'task-card-1',
      },
    })
    fixture.respond({
      type: ShadowBridge.openCopilotResponseType,
      requestId: fixture.posted[3]?.message.requestId,
      ok: true,
      result: { opened: true },
    })

    await expect(openPromise).resolves.toEqual({ opened: true })

    const workspaceOpenPromise = bridge.openWorkspaceResource({
      resource: {
        uri: 'workspace://renders/final.mp4',
        workspaceNodeId: 'workspace-node-1',
        title: 'Final render',
      },
    })
    expect(fixture.posted[4]?.message).toMatchObject({
      appKey: 'skills',
      type: ShadowBridge.openWorkspaceResourceRequestType,
      resource: {
        uri: 'workspace://renders/final.mp4',
        workspaceNodeId: 'workspace-node-1',
        title: 'Final render',
      },
    })
    fixture.respond({
      type: ShadowBridge.openWorkspaceResourceResponseType,
      requestId: fixture.posted[4]?.message.requestId,
      ok: true,
      result: { opened: true },
    })

    await expect(workspaceOpenPromise).resolves.toEqual({ opened: true })
  })

  it('keeps bridge context after app-side routing removes launch query', async () => {
    const fixture = createBridgeWindow()
    const bridge = new ShadowBridge({ appKey: 'warbuddy', windowRef: fixture.win })
    expect(bridge.isAvailable()).toBe(true)

    ;(fixture.win.location as unknown as { search: string }).search = ''
    expect(bridge.isAvailable()).toBe(true)

    const routedBridge = new ShadowBridge({ appKey: 'warbuddy', windowRef: fixture.win })
    expect(routedBridge.isAvailable()).toBe(true)

    const createPromise = routedBridge.openBuddyCreator({
      landing: { title: 'WarBuddy tactics', source: 'warbuddy' },
    })
    expect(fixture.posted[0]?.message).toMatchObject({
      appKey: 'warbuddy',
      type: ShadowBridge.openBuddyCreatorRequestType,
      landing: { title: 'WarBuddy tactics', source: 'warbuddy' },
    })

    fixture.respond({
      type: ShadowBridge.openBuddyCreatorResponseType,
      requestId: fixture.posted[0]?.message.requestId,
      ok: true,
      result: { opened: true, agent: { id: 'agent-1' } },
    })

    await expect(createPromise).resolves.toEqual({
      opened: true,
      agent: { id: 'agent-1' },
    })
  })
})
