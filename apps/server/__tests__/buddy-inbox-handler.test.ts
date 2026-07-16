import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createBuddyInboxHandler } from '../src/handlers/buddy-inbox.handler'

vi.mock('../src/lib/jwt', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-1',
    username: 'tester',
    typ: 'access',
    aud: 'shadow:access',
    iss: 'shadow',
    jti: 'jwt-1',
  }),
}))

function createTestApp(deps: Record<string, unknown>) {
  const app = new Hono()
  app.route(
    '/api',
    createBuddyInboxHandler({
      resolve: (name: string) => {
        const dep = deps[name]
        if (dep) return dep
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as never),
  )
  return app
}

describe('buddy inbox handler', () => {
  it('enqueues a task card by server slug and Buddy agent id', async () => {
    const emit = vi.fn()
    const enqueueTaskForAgent = vi.fn().mockResolvedValue({
      id: 'message-1',
      channelId: 'channel-inbox-1',
    })
    const app = createTestApp({
      serverDao: {
        findBySlug: vi.fn().mockResolvedValue({ id: 'server-1', slug: 'shadow-plays' }),
      },
      buddyInboxService: {
        enqueueTaskForAgent,
      },
      io: {
        to: vi.fn().mockReturnValue({ emit }),
      },
    })

    const response = await app.request('/api/servers/shadow-plays/inboxes/agent-1/tasks', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Install grill-me',
        body: 'Download the skill zip and install it.',
        priority: 'normal',
        tags: ['UI', { label: 'Design QA' }],
        app: { appKey: 'figma', name: 'Figma', logoUrl: 'https://example.com/figma.png' },
        idempotencyKey: 'skills:install:grill-me:agent-1',
        source: { kind: 'space_app', appKey: 'skills' },
        data: { skill: 'grill-me' },
      }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: 'message-1',
      channelId: 'channel-inbox-1',
    })
    expect(enqueueTaskForAgent).toHaveBeenCalledWith(
      'server-1',
      'agent-1',
      expect.objectContaining({
        title: 'Install grill-me',
        tags: ['UI', { label: 'Design QA' }],
        app: { appKey: 'figma', name: 'Figma', logoUrl: 'https://example.com/figma.png' },
        source: { kind: 'space_app', appKey: 'skills' },
        data: { skill: 'grill-me' },
      }),
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
    expect(emit).toHaveBeenCalledWith('message:new', {
      id: 'message-1',
      channelId: 'channel-inbox-1',
    })
  })

  it('updates Buddy Inbox admission policy by server slug and Buddy agent id', async () => {
    const updateAdmissionPolicy = vi.fn().mockResolvedValue({
      channel: { id: 'channel-inbox-1' },
      policy: { defaultMode: 'deny', rules: [] },
    })
    const app = createTestApp({
      serverDao: {
        findBySlug: vi.fn().mockResolvedValue({ id: 'server-1', slug: 'shadow-plays' }),
      },
      buddyInboxService: {
        updateAdmissionPolicy,
      },
      io: {
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      },
    })

    const response = await app.request(
      '/api/servers/shadow-plays/inboxes/agent-1/admission-policy',
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          defaultMode: 'deny',
          rules: [{ subjectKind: 'space_app', appKey: 'skills', mode: 'allow' }],
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      channel: { id: 'channel-inbox-1' },
      policy: { defaultMode: 'deny', rules: [] },
    })
    expect(updateAdmissionPolicy).toHaveBeenCalledWith(
      'server-1',
      'agent-1',
      {
        defaultMode: 'deny',
        rules: [{ subjectKind: 'space_app', appKey: 'skills', mode: 'allow' }],
      },
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
  })

  it('lists pending Buddy Inbox deliveries by server slug and Buddy agent id', async () => {
    const listAdmissionPending = vi.fn().mockResolvedValue({
      channel: { id: 'channel-inbox-1' },
      pending: [{ id: 'pending-1', task: { title: 'Review video script' } }],
    })
    const app = createTestApp({
      serverDao: {
        findBySlug: vi.fn().mockResolvedValue({ id: 'server-1', slug: 'shadow-plays' }),
      },
      buddyInboxService: {
        listAdmissionPending,
      },
    })

    const response = await app.request(
      '/api/servers/shadow-plays/inboxes/agent-1/admission-pending',
      {
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      channel: { id: 'channel-inbox-1' },
      pending: [{ id: 'pending-1', task: { title: 'Review video script' } }],
    })
    expect(listAdmissionPending).toHaveBeenCalledWith(
      'server-1',
      'agent-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
  })

  it('approves pending Buddy Inbox deliveries and emits message delivery events', async () => {
    const emit = vi.fn()
    const approveAdmissionPending = vi.fn().mockResolvedValue({
      channel: { id: 'channel-inbox-1' },
      pending: { id: 'pending-1' },
      message: { id: 'message-1', channelId: 'channel-inbox-1' },
    })
    const app = createTestApp({
      serverDao: {
        findBySlug: vi.fn().mockResolvedValue({ id: 'server-1', slug: 'shadow-plays' }),
      },
      buddyInboxService: {
        approveAdmissionPending,
      },
      io: {
        to: vi.fn().mockReturnValue({ emit }),
      },
    })

    const response = await app.request(
      '/api/servers/shadow-plays/inboxes/agent-1/admission-pending/pending-1/approve',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    )

    expect(response.status).toBe(201)
    expect(approveAdmissionPending).toHaveBeenCalledWith(
      'server-1',
      'agent-1',
      'pending-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
    expect(emit).toHaveBeenCalledWith(
      'buddy-inbox:admission-pending-updated',
      expect.objectContaining({ pending: { id: 'pending-1' } }),
    )
    expect(emit).toHaveBeenCalledWith('message:new', {
      id: 'message-1',
      channelId: 'channel-inbox-1',
    })
  })

  it('rejects pending Buddy Inbox deliveries and emits pending update events', async () => {
    const emit = vi.fn()
    const rejectAdmissionPending = vi.fn().mockResolvedValue({
      channel: { id: 'channel-inbox-1' },
      pending: { id: 'pending-1' },
    })
    const app = createTestApp({
      serverDao: {
        findBySlug: vi.fn().mockResolvedValue({ id: 'server-1', slug: 'shadow-plays' }),
      },
      buddyInboxService: {
        rejectAdmissionPending,
      },
      io: {
        to: vi.fn().mockReturnValue({ emit }),
      },
    })

    const response = await app.request(
      '/api/servers/shadow-plays/inboxes/agent-1/admission-pending/pending-1/reject',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    )

    expect(response.status).toBe(200)
    expect(rejectAdmissionPending).toHaveBeenCalledWith(
      'server-1',
      'agent-1',
      'pending-1',
      expect.objectContaining({ kind: 'user', userId: 'user-1' }),
    )
    expect(emit).toHaveBeenCalledWith(
      'buddy-inbox:admission-pending-updated',
      expect.objectContaining({ pending: { id: 'pending-1' } }),
    )
  })
})
