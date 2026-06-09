import { describe, expect, it } from 'vitest'
import { ShadowBridge } from '../src/bridge'

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
  it('discovers host UX capabilities and opens Shadow surfaces', async () => {
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
        capabilities: ['copilot.open', 'workspace.open', 'buddy.create.open', 'route.navigate'],
      },
    })
    await expect(capabilitiesPromise).resolves.toEqual({
      capabilities: ['copilot.open', 'workspace.open', 'buddy.create.open', 'route.navigate'],
    })

    const openPromise = bridge.openCopilot({
      channelId: 'channel-1',
      messageId: 'message-2',
      cardId: 'task-card-1',
    })
    expect(fixture.posted[1]?.message).toMatchObject({
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
      requestId: fixture.posted[1]?.message.requestId,
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
    expect(fixture.posted[2]?.message).toMatchObject({
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
      requestId: fixture.posted[2]?.message.requestId,
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
