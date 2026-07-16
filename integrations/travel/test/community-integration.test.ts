import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/src/app.js'
import { createAppContainer } from '../server/src/container.js'
import { ShadowGateway } from '../server/src/gateways/shadow.gateway.js'
import { travelManifest } from '../server/src/lib/manifest.js'
import { auditSubject } from '../server/src/middleware/audit.middleware.js'
import { assertTravelRequestAuthenticated } from '../server/src/middleware/auth.middleware.js'
import { createTravelRequestContextFromHeaders } from '../server/src/middleware/request-context.middleware.js'
import { CommandSecurity } from '../server/src/security/command-auth.js'
import { travelLocalActorAllowed } from '../server/src/security/oauth.js'
import { IdentityService } from '../server/src/services/identity.service.js'
import type { RequestContext } from '../server/src/types.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  delete process.env.TRAVEL_DATA_FILE
  delete process.env.TRAVEL_REQUIRE_OAUTH
  delete process.env.TRAVEL_ALLOW_LAUNCH_BUSINESS_AUTH
  delete process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN
  delete process.env.TRAVEL_ALLOW_LOCAL_ACTOR
  vi.unstubAllGlobals()
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('travel community integration', () => {
  it('ignores untrusted identity headers and fails closed for production local actors', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    delete process.env.TRAVEL_ALLOW_LOCAL_ACTOR
    try {
      expect(travelLocalActorAllowed()).toBe(false)
      const context = await createTravelRequestContextFromHeaders({
        headers: new Headers({
          'x-shadow-server-id': 'spoofed-space',
          'x-shadow-user-id': 'spoofed-user',
          'x-shadow-actor-kind': 'system',
        }),
      })
      expect(context).toMatchObject({
        serverId: 'local-server',
        local: true,
        actor: { kind: 'local', id: 'local-user' },
        auth: { authenticated: false },
      })
      expect(() => assertTravelRequestAuthenticated(context)).toThrow()
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('rejects the removed launch-header command authentication path', async () => {
    process.env.TRAVEL_ALLOW_LOCAL_ACTOR = 'false'
    const baseContext: RequestContext = {
      requestId: 'req-legacy',
      serverId: 'local-server',
      actor: { kind: 'local' },
      startedAt: new Date().toISOString(),
      local: true,
      auth: {
        authenticated: false,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        oauthConfigured: false,
        oauthRequired: false,
      },
    }
    await expect(
      new CommandSecurity().requestContextForCommand(
        {
          req: {
            header: (name: string) =>
              name.toLowerCase() === 'x-shadow-launch-token' ? 'legacy-launch-token' : undefined,
          },
          get: () => baseContext,
        } as never,
        'travel.contextPack',
      ),
    ).rejects.toThrow()
  })

  it('isolates open groups by Space and completes the join approval flow', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-recruitment-'))
    temporaryDirectories.push(directory)
    process.env.TRAVEL_DATA_FILE = join(directory, 'state.json')
    process.env.TRAVEL_REQUIRE_OAUTH = 'false'
    process.env.TRAVEL_ALLOW_LOCAL_ACTOR = 'false'
    const container = await createAppContainer()
    const app = createApp(container)
    const ownerSession = await container.identityService.issueSession(
      { id: 'owner-1', displayName: 'Owner' },
      'test',
      3600,
      { authSource: 'oauth', serverId: 'space-a' },
    )
    const applicantSession = await container.identityService.issueSession(
      { id: 'traveler-2', displayName: 'Traveler Two' },
      'test',
      3600,
      { authSource: 'oauth', serverId: 'space-a' },
    )
    const otherSpaceSession = await container.identityService.issueSession(
      { id: 'user-b', displayName: 'Other Space User' },
      'test',
      3600,
      { authSource: 'oauth', serverId: 'space-b' },
    )
    const ownerHeaders = {
      'content-type': 'application/json',
      cookie: `travel_oauth_session=${ownerSession.token}`,
    }
    const created = await app.request('/api/trips', {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        title: 'Iceland road trip',
        currency: 'CNY',
        timezone: 'Atlantic/Reykjavik',
        destinationLabels: ['Iceland'],
      }),
    })
    const tripId = ((await created.json()) as { data: { id: string } }).data.id

    const published = await app.request(`/api/trips/${tripId}/recruitment`, {
      method: 'PUT',
      headers: ownerHeaders,
      body: JSON.stringify({
        status: 'open',
        maxMembers: 4,
        styles: ['outdoor', 'photo'],
        questions: ['Can you drive?'],
      }),
    })
    expect(published.status).toBe(200)
    const recruitmentId = ((await published.json()) as { data: { id: string } }).data.id

    const otherSpace = await app.request('/api/recruitments', {
      headers: { cookie: `travel_oauth_session=${otherSpaceSession.token}` },
    })
    await expect(otherSpace.json()).resolves.toMatchObject({ data: [] })

    const applicantHeaders = {
      'content-type': 'application/json',
      cookie: `travel_oauth_session=${applicantSession.token}`,
    }
    const visible = await app.request('/api/recruitments', { headers: applicantHeaders })
    await expect(visible.json()).resolves.toMatchObject({
      data: [{ recruitment: { id: recruitmentId }, viewerIsMember: false }],
    })

    const intent = await app.request('/api/travel-intents/me', {
      method: 'PUT',
      headers: applicantHeaders,
      body: JSON.stringify({
        destinationLabels: ['Iceland'],
        flexibleDates: true,
        budgetMax: 18000,
        currency: 'CNY',
        styles: ['outdoor'],
      }),
    })
    expect(intent.status).toBe(200)
    const matched = await app.request('/api/recruitments', { headers: applicantHeaders })
    await expect(matched.json()).resolves.toMatchObject({
      data: [
        {
          recruitment: { id: recruitmentId },
          matchScore: 72,
          matchReasons: ['destination', 'style', 'flexible_dates'],
        },
      ],
    })
    const intentsInSpace = await app.request('/api/travel-intents', {
      headers: ownerHeaders,
    })
    await expect(intentsInSpace.json()).resolves.toMatchObject({
      data: [{ userId: 'traveler-2', destinationLabels: ['Iceland'] }],
    })
    const intentsElsewhere = await app.request('/api/travel-intents', {
      headers: { cookie: `travel_oauth_session=${otherSpaceSession.token}` },
    })
    await expect(intentsElsewhere.json()).resolves.toMatchObject({ data: [] })

    const applied = await app.request(`/api/recruitments/${recruitmentId}/applications`, {
      method: 'POST',
      headers: applicantHeaders,
      body: JSON.stringify({
        message: 'I enjoy road trips.',
        answers: [{ question: 'Can you drive?', answer: 'Yes' }],
      }),
    })
    expect(applied.status).toBe(200)
    const applicationId = ((await applied.json()) as { data: { id: string } }).data.id

    const approved = await app.request(
      `/api/trips/${tripId}/applications/${applicationId}/review`,
      {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ status: 'approved' }),
      },
    )
    expect(approved.status).toBe(200)

    const members = await app.request(`/api/trips/${tripId}/members`, { headers: ownerHeaders })
    await expect(members.json()).resolves.toMatchObject({
      data: [
        { userId: 'owner-1', role: 'owner' },
        { userId: 'traveler-2', role: 'traveler' },
      ],
    })
  })

  it('attributes command audit entries to the trip in the command payload', () => {
    expect(
      auditSubject('/.shadow/commands/travel.addTodo', {
        input: { tripId: 'trip_1', title: 'Confirm the meeting time' },
      }),
    ).toEqual({
      tripId: 'trip_1',
      subjectType: 'command',
      subjectId: 'travel.addTodo',
    })
  })

  it('persists opaque app sessions and resolves the linked Shadow identity', async () => {
    const accounts: unknown[] = []
    const links: unknown[] = []
    const sessions: Array<Record<string, unknown>> = []
    const service = new IdentityService({
      findAccountByShadowUserId: async () => null,
      upsertIdentity: async (account, link) => {
        accounts.push(account)
        links.push(link)
        return { account, link }
      },
      createSession: async (session) => {
        sessions.push(session)
        return session
      },
      findSessionByTokenHash: async (tokenHash) => {
        const session = sessions.find((item) => item.tokenHash === tokenHash)
        return session
          ? {
              session,
              account: accounts[0],
            }
          : null
      },
      revokeSession: async () => true,
    } as never)

    const issued = await service.issueSession(
      { id: 'shadow_user_1', username: 'traveler', displayName: 'Traveler' },
      'user:read',
      3600,
    )

    expect(issued.token).not.toContain('shadow_user_1')
    expect(sessions[0]?.tokenHash).not.toBe(issued.token)
    await expect(service.readSession(issued.token)).resolves.toMatchObject({
      profile: { id: 'shadow_user_1', username: 'traveler' },
      scope: 'user:read',
    })
  })

  it('binds a Buddy, accepts a proposed plan, and applies reviewed operations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-community-'))
    temporaryDirectories.push(directory)
    process.env.TRAVEL_DATA_FILE = join(directory, 'state.json')
    process.env.TRAVEL_REQUIRE_OAUTH = 'false'
    const container = await createAppContainer()
    const app = createApp(container)

    const createTrip = await app.request('/api/trips', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Community trip',
        timezone: 'Asia/Shanghai',
        currency: 'CNY',
        destinationLabels: ['Shanghai'],
      }),
    })
    expect(createTrip.status).toBe(200)
    const tripId = ((await createTrip.json()) as { data: { id: string } }).data.id

    const binding = await app.request(`/api/trips/${tripId}/buddy-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'buddy_planner_1',
        displayName: 'Route Buddy',
        capabilities: ['itinerary'],
      }),
    })
    expect(binding.status).toBe(200)

    const proposal = await app.request(`/api/trips/${tripId}/buddy-plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Arrival checklist',
        operations: [
          {
            kind: 'todo.create',
            input: { title: 'Download the metro app', category: 'transport', priority: 'high' },
          },
        ],
      }),
    })
    expect(proposal.status).toBe(200)
    const draftId = ((await proposal.json()) as { data: { id: string } }).data.id

    const review = await app.request(`/api/trips/${tripId}/buddy-plans/${draftId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    })
    expect(review.status).toBe(200)
    await expect(review.json()).resolves.toMatchObject({
      data: {
        draft: { status: 'accepted' },
        applied: [{ kind: 'todo.create' }],
      },
    })

    const todos = await app.request(`/api/trips/${tripId}/todos`)
    await expect(todos.json()).resolves.toMatchObject({
      data: [{ title: 'Download the metro app' }],
    })
  })

  it('lets only an explicitly owner-delegated Buddy execute validated trip actions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-buddy-delegation-'))
    temporaryDirectories.push(directory)
    process.env.TRAVEL_DATA_FILE = join(directory, 'state.json')
    process.env.TRAVEL_REQUIRE_OAUTH = 'false'
    const container = await createAppContainer()
    const app = createApp(container)

    const created = await app.request('/api/trips', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Delegated trip', timezone: 'UTC', currency: 'USD' }),
    })
    const tripId = ((await created.json()) as { data: { id: string } }).data.id

    await app.request(`/api/trips/${tripId}/buddy-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'buddy_limited', capabilities: ['itinerary'] }),
    })
    await app.request(`/api/trips/${tripId}/buddy-bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'buddy_owner', capabilities: ['owner.delegate'] }),
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get('authorization') ?? ''
        const agentId = authorization.replace(/^Bearer command-/u, '')
        return new Response(
          JSON.stringify({
            active: true,
            shadow: {
              protocol: 'shadow.space-app/1',
              serverId: 'local-server',
              spaceAppId: 'app-travel',
              appKey: 'travel',
              command: 'travel.performTripAction',
              permission: 'travel.trips:write',
              action: 'write',
              dataClass: 'server-private',
              actor: {
                kind: 'agent',
                userId: `${agentId}-user`,
                buddyAgentId: agentId,
                ownerId: 'local-user',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }),
    )

    const callAction = (agentId: string, action: string, input: Record<string, unknown>) =>
      app.request('/.shadow/commands/travel.performTripAction', {
        method: 'POST',
        headers: {
          authorization: `Bearer command-${agentId}`,
          'content-type': 'application/json',
          'x-shadow-server-id': 'local-server',
          'x-space-app-key': 'travel',
        },
        body: JSON.stringify({ input: { tripId, action, input } }),
      })

    const denied = await callAction('buddy_limited', 'trip.update', { title: 'Should fail' })
    expect(denied.status).toBe(403)

    const updated = await callAction('buddy_owner', 'trip.update', {
      title: 'Buddy coordinated trip',
    })
    expect(updated.status).toBe(200)
    await expect(updated.json()).resolves.toMatchObject({
      data: { id: tripId, title: 'Buddy coordinated trip' },
    })

    const addedDay = await callAction('buddy_owner', 'day.add', { date: '2026-08-01' })
    expect(addedDay.status).toBe(200)
    await expect(addedDay.json()).resolves.toMatchObject({
      data: { tripId, date: '2026-08-01' },
    })
  })

  it('publishes the full delegated action vocabulary in the Space App manifest', () => {
    const actionCommand = travelManifest().commands.find(
      (item) => item.name === 'travel.performTripAction',
    )
    expect(actionCommand).toBeDefined()
    expect(actionCommand?.inputSchema).toMatchObject({
      properties: {
        action: {
          enum: expect.arrayContaining([
            'member.add',
            'assignment.update',
            'reservation.setStatus',
            'expense.setMembers',
            'packingItem.bulkImport',
            'buddy.bind',
            'community.share',
          ]),
        },
      },
    })
  })

  it('registers and serves the responsive currency widget through a read command', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-currency-widget-'))
    temporaryDirectories.push(directory)
    process.env.TRAVEL_DATA_FILE = join(directory, 'state.json')
    const manifest = travelManifest()
    const widget = manifest.widgets.find((item) => item.key === 'currency')
    const command = manifest.commands.find((item) => item.name === widget?.data.command)
    expect(widget).toMatchObject({
      category: 'finance',
      surfaces: ['desktop', 'mobile'],
      data: { command: 'travel.currencyWidget', refreshIntervalSeconds: 300 },
    })
    expect(command).toMatchObject({ action: 'read', permission: 'travel.trips:read' })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ quote: 'CNY', rate: 7.2 }],
      }),
    )
    const container = await createAppContainer()
    const app = createApp(container)
    const response = await app.request('/.shadow/commands/travel.currencyWidget', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { base: 'USD', quote: 'CNY' } }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: {
        pair: 'USD / CNY',
        rate: 7.2,
        rateText: '7.20',
        summary: '1 USD = 7.20 CNY',
        provider: 'Frankfurter',
      },
    })
  })

  it('uses the community launch inbox and outbox protocol with delivery receipts', async () => {
    const payload = Buffer.from(
      JSON.stringify({ serverId: 'server_1', appKey: 'travel' }),
    ).toString('base64url')
    const launchToken = `sat_v1.${payload}.test-signature`
    const requests: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith('/launch/inboxes')) {
        return new Response(
          JSON.stringify({
            inboxes: [
              {
                agent: {
                  id: 'buddy_1',
                  ownerId: 'user_1',
                  user: {
                    id: 'buddy_user_1',
                    username: 'planner-buddy',
                    displayName: 'Planner',
                  },
                },
                channel: { id: 'channel_1' },
                canManage: true,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({
          task: {},
          shadow: {
            protocol: 'shadow.space-app/1',
            outbox: {
              deliveries: [
                { agentId: 'buddy_1', messageId: 'message_1', cardId: 'card_1', taskId: 'task_1' },
              ],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    const ctx: RequestContext = {
      requestId: 'req_1',
      serverId: 'server_1',
      actor: { kind: 'user', userId: 'user_1' },
      startedAt: new Date().toISOString(),
      local: false,
      auth: {
        authenticated: true,
        launchAuthenticated: true,
        oauthAuthenticated: false,
        oauthConfigured: false,
        oauthRequired: false,
      },
      launch: { appKey: 'travel', token: launchToken },
    }
    const gateway = new ShadowGateway()

    await expect(gateway.listBuddyInboxes(ctx)).resolves.toMatchObject({
      inboxes: [
        {
          agentId: 'buddy_1',
          agentUserId: 'buddy_user_1',
          channelId: 'channel_1',
          displayName: 'Planner',
        },
      ],
    })
    await expect(
      gateway.dispatchBuddyTask(ctx, {
        agentId: 'buddy_1',
        title: 'Plan a day',
        body: 'Build a reviewable plan',
        idempotencyKey: 'travel:test:1',
        resource: { kind: 'travel.trip', id: 'trip_1' },
        data: { tripId: 'trip_1' },
      }),
    ).resolves.toMatchObject({
      delivery: { messageId: 'message_1', cardId: 'card_1' },
    })

    expect(requests.map((item) => item.url)).toEqual([
      'http://localhost:3002/api/servers/server_1/space-apps/travel/launch/inboxes',
      'http://localhost:3002/api/servers/server_1/space-apps/travel/launch/outbox',
    ])
    expect(requests[1]?.init?.headers).toMatchObject({
      Authorization: `Bearer ${launchToken}`,
    })
    expect(String(requests[1]?.init?.body)).toContain('shadow.space-app/1')
    expect(String(requests[1]?.init?.body)).toContain('inboxTasks')
  })

  it('never serializes the launch credential from request context', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'travel-session-context-'))
    temporaryDirectories.push(directory)
    process.env.TRAVEL_DATA_FILE = join(directory, 'state.json')
    const container = await createAppContainer()
    const launchToken = 'sat_v1.private-launch-credential.signature'
    const session = await container.identityService.issueSession(
      { id: 'user_1', displayName: 'Traveler' },
      'space-app:session',
      3600,
      {
        authSource: 'launch',
        serverId: 'server_1',
        spaceAppId: 'app_1',
        appKey: 'travel',
        actorKind: 'user',
        actorUserId: 'user_1',
        ownerId: 'user_1',
        launchToken,
      },
    )
    const context = await createTravelRequestContextFromHeaders({
      headers: new Headers({ cookie: `travel_oauth_session=${session.token}` }),
      identityService: container.identityService,
    })
    expect(context.launch?.token).toBe(launchToken)
    expect(JSON.stringify(context)).not.toContain(launchToken)
    expect(() => assertTravelRequestAuthenticated(context)).not.toThrow()
  })

  it('normalizes human Space members and excludes Buddy agents', async () => {
    process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN = 'installation-token'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'membership_buddy',
                userId: 'buddy_user',
                nickname: 'Planner Buddy',
                agent: { id: 'agent_1' },
                user: { id: 'buddy_user', username: 'planner-buddy', isBot: true },
              },
              {
                id: 'membership_user',
                userId: 'user_2',
                nickname: 'Mei',
                user: {
                  id: 'user_2',
                  username: 'mei',
                  displayName: 'Mei Chen',
                  avatarUrl: 'https://example.com/mei.png',
                },
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    )
    const gateway = new ShadowGateway()
    await expect(
      gateway.listHumanMembers({ serverId: 'server_1' } as RequestContext),
    ).resolves.toEqual({
      connected: true,
      members: [
        {
          avatarUrl: 'https://example.com/mei.png',
          displayName: 'Mei',
          id: 'membership_user',
          kind: 'user',
          role: undefined,
          userId: 'user_2',
          username: 'mei',
        },
      ],
    })
  })

  it('lists public text channels for the share picker', async () => {
    process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN = 'installation-token'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              { id: 'channel_general', name: 'general', type: 'text', isPrivate: false },
              { id: 'channel_inbox', name: 'inbox-buddy', type: 'text', isPrivate: true },
              { id: 'channel_voice', name: 'voice', type: 'voice', isPrivate: false },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    )
    await expect(
      new ShadowGateway().listChannels({ serverId: 'server_1' } as RequestContext),
    ).resolves.toEqual({
      connected: true,
      channels: [{ id: 'channel_general', name: 'general', type: 'text' }],
    })
  })

  it('keeps command-JWT authentication independent from OAuth and launch tokens', async () => {
    process.env.TRAVEL_REQUIRE_OAUTH = 'true'
    const commandToken = 'command-jwt'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe('http://localhost:3002/api/space-apps/commands/introspect')
        expect(init).toMatchObject({
          method: 'POST',
          headers: { Authorization: `Bearer ${commandToken}` },
        })
        return Promise.resolve(
          new Response(
            JSON.stringify({
              active: true,
              shadow: {
                protocol: 'shadow.space-app/1',
                serverId: 'server_1',
                spaceAppId: 'app_1',
                appKey: 'travel',
                command: 'travel.contextPack',
                permission: 'travel.trips:read',
                action: 'read',
                dataClass: 'server-private',
                actor: {
                  kind: 'agent',
                  userId: 'buddy_user_1',
                  buddyAgentId: 'buddy_1',
                  ownerId: 'owner_1',
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        )
      }),
    )
    const baseContext: RequestContext = {
      requestId: 'req_command',
      serverId: 'local-server',
      actor: { kind: 'local' },
      startedAt: new Date().toISOString(),
      local: true,
      auth: {
        authenticated: false,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        oauthConfigured: true,
        oauthRequired: true,
      },
    }
    const context = await new CommandSecurity().requestContextForCommand(
      {
        req: {
          header: (name: string) => {
            if (name.toLowerCase() === 'authorization') return `Bearer ${commandToken}`
            return undefined
          },
        },
        get: () => baseContext,
      } as never,
      'travel.contextPack',
    )

    expect(context.actor).toMatchObject({ kind: 'buddy', buddyId: 'buddy_1' })
    expect(context.auth).toMatchObject({
      authenticated: true,
      launchAuthenticated: false,
      oauthAuthenticated: false,
    })
  })
})
