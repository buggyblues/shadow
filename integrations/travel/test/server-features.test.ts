import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import type { AppContainer } from '../server/src/container.js'
import { ClientStateDao } from '../server/src/dao/client-state.dao.js'
import { CollaborationDao } from '../server/src/dao/collaboration.dao.js'
import { TripDao } from '../server/src/dao/trip.dao.js'
import { normalizeTravelState } from '../server/src/db/schema.js'
import { ShadowGateway } from '../server/src/gateways/shadow.gateway.js'
import { createApiHandler } from '../server/src/handlers/api.handler.js'
import { AccessPolicy } from '../server/src/security/access-policy.js'
import { AutomationService } from '../server/src/services/automation.service.js'
import { BudgetService } from '../server/src/services/budget.service.js'
import { ClientStateService } from '../server/src/services/client-state.service.js'
import {
  EmergencyReportService,
  emergencyReportRemovalThreshold,
} from '../server/src/services/emergency-report.service.js'
import { PackingService } from '../server/src/services/packing.service.js'
import { PlanningService } from '../server/src/services/planning.service.js'
import type { Expense, TravelHonoEnv } from '../server/src/types.js'
import { CollaborationUseCase } from '../server/src/usecases/collaboration.usecase.js'
import { TravelEventBus } from '../server/src/ws/travel-events.js'
import { attachTravelWebSocketServer } from '../server/src/ws/websocket.js'

function launchToken(serverId = 'server_1', appKey = 'travel') {
  const payload = Buffer.from(JSON.stringify({ serverId, appKey })).toString('base64url')
  return `sat_v1.${payload}.signature`
}

function kmzBase64(fileName: string, content: string) {
  const name = Buffer.from(fileName)
  const data = Buffer.from(content)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(0, 8)
  header.writeUInt32LE(0, 10)
  header.writeUInt32LE(data.length, 18)
  header.writeUInt32LE(data.length, 22)
  header.writeUInt16LE(name.length, 26)
  header.writeUInt16LE(0, 28)
  return Buffer.concat([header, name, data]).toString('base64')
}

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense_1',
    tripId: 'trip_1',
    title: 'Dinner',
    category: 'food',
    amount: 100,
    currency: 'USD',
    paidByMemberId: 'member_1',
    participantMemberIds: ['member_1', 'member_2'],
    splitMode: 'equal',
    shares: [],
    paidMemberIds: [],
    status: 'pending',
    sequence: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('travel server feature units', () => {
  it('fails a Buddy automation that finishes without the required Travel plan draft', async () => {
    let task = {
      id: 'task_1',
      tripId: 'trip_1',
      source: 'buddy' as const,
      status: 'running' as const,
      title: 'Plan day one',
      input: {},
      shadowDelivery: { messageId: 'message_1', cardId: 'card_1' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    }
    const dao = {
      listTasks: vi.fn(async () => [task]),
      updateTask: vi.fn(async (_id, update) => {
        task = update(task) as typeof task
        return task
      }),
    }
    const gateway = {
      getBuddyTaskStatus: vi.fn(async () => ({ status: 'completed' as const })),
    }
    const service = new AutomationService(dao as never, gateway as never)

    await expect(service.listTasks({} as never, 'trip_1')).resolves.toEqual([
      expect.objectContaining({
        error: expect.stringContaining('without submitting'),
        status: 'failed',
      }),
    ])
    expect(gateway.getBuddyTaskStatus).toHaveBeenCalledWith(expect.anything(), task.shadowDelivery)
  })

  it('publishes a contextual discussion and stores its channel message reference', async () => {
    const listDiscussionRefs = vi.fn(async () => [])
    const createDiscussionRef = vi.fn(async (_tripId, input) => ({
      id: 'discussion_1',
      tripId: 'trip_1',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...input,
    }))
    const shareToChannel = vi.fn(async () => ({
      channelId: 'channel_1',
      messageId: 'message_1',
    }))
    const eventBus = new TravelEventBus()
    const ensureDiscussionChannel = vi.fn(async () => ({ id: 'channel_1', name: '旅行-Paris' }))
    const useCase = new CollaborationUseCase(
      { createDiscussionRef, listDiscussionRefs } as never,
      {} as never,
      {
        requireTripWrite: vi.fn(async () => ({
          member: { id: 'member_1' },
          trip: { id: 'trip_1', title: 'Paris' },
        })),
      } as never,
      eventBus,
      { ensureDiscussionChannel, shareToChannel } as never,
    )

    await expect(
      useCase.startDiscussion({} as never, 'trip_1', {
        channelId: 'channel_1',
        subjectType: 'place',
        subjectId: 'place_1',
        title: 'Discuss the museum',
      }),
    ).resolves.toMatchObject({
      channelId: 'channel_1',
      messageId: 'message_1',
      subjectId: 'place_1',
    })
    expect(shareToChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        channelId: 'channel_1',
        channelName: '旅行-Paris',
        metadata: expect.objectContaining({ cards: expect.any(Array) }),
      }),
    )
    expect(ensureDiscussionChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ preferredChannelId: 'channel_1', tripId: 'trip_1' }),
    )
    expect(createDiscussionRef).toHaveBeenCalledWith(
      'trip_1',
      expect.objectContaining({ messageId: 'message_1' }),
    )
    expect(eventBus.recentTripEvents('trip_1')).toEqual([
      expect.objectContaining({ type: 'discussion.ref.created' }),
    ])
  })

  it('reuses an existing contextual discussion without posting another message', async () => {
    const existing = {
      id: 'discussion_existing',
      tripId: 'trip_1',
      channelId: 'channel_existing',
      messageId: 'message_existing',
      subjectType: 'day',
      subjectId: '2',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const ensureDiscussionChannel = vi.fn()
    const shareToChannel = vi.fn()
    const useCase = new CollaborationUseCase(
      { listDiscussionRefs: vi.fn(async () => [existing]) } as never,
      {} as never,
      {
        requireTripWrite: vi.fn(async () => ({ trip: { id: 'trip_1', title: 'Paris' } })),
      } as never,
      new TravelEventBus(),
      { ensureDiscussionChannel, shareToChannel } as never,
    )

    await expect(
      useCase.startDiscussion({} as never, 'trip_1', {
        subjectType: 'day',
        subjectId: '2',
        title: 'Day 2',
      }),
    ).resolves.toEqual(existing)
    expect(ensureDiscussionChannel).not.toHaveBeenCalled()
    expect(shareToChannel).not.toHaveBeenCalled()
  })

  it('creates one deterministic trip discussion channel when none can be reused', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ channelId: 'channel_new', created: true, name: '旅行-Paris' }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const channel = await new ShadowGateway().ensureDiscussionChannel(
        { launch: { token: launchToken() }, serverId: 'server_1' } as never,
        { tripId: 'trip_1', tripTitle: 'Paris' },
      )
      expect(channel).toMatchObject({ id: 'channel_new', name: '旅行-Paris' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/launch/channels/ensure')
      expect(fetchMock.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          body: expect.stringContaining('travel-trip:trip_1'),
          method: 'POST',
        }),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('never falls back to a public Space channel when private provisioning is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    )
    try {
      await expect(
        new ShadowGateway().ensureDiscussionChannel(
          { launch: { token: launchToken() }, serverId: 'server_1' } as never,
          { tripId: 'trip_1', tripTitle: 'Paris' },
        ),
      ).rejects.toThrow('private trip discussion channel')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('accepts a host-provisioned private channel and lets outbox validate its Space', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(
        new ShadowGateway().ensureDiscussionChannel(
          { launch: { token: 'launch-token' }, serverId: 'server_1' } as never,
          {
            preferredChannelId: 'private_trip_channel',
            tripId: 'trip_1',
            tripTitle: 'Paris',
          },
        ),
      ).resolves.toEqual({ id: 'private_trip_channel', name: 'trip-trip_1' })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('deduplicates contextual discussion refs when a legacy channel is migrated', async () => {
    const state = normalizeTravelState(null)
    const dao = new CollaborationDao({
      init: async () => undefined,
      snapshot: () => state,
      read: async <T>(reader: (value: typeof state) => T | Promise<T>) => reader(state),
      write: async <T>(writer: (value: typeof state) => T | Promise<T>) => writer(state),
    })
    const base = {
      tripId: 'trip_1',
      messageId: 'message_1',
      subjectType: 'day',
      subjectId: '2',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    await dao.createDiscussionRef({ ...base, id: 'legacy', channelId: 'general' })
    await dao.createDiscussionRef({
      ...base,
      id: 'private',
      channelId: 'private_trip_channel',
      messageId: 'message_2',
    })
    await expect(dao.listDiscussionRefs('trip_1')).resolves.toEqual([
      expect.objectContaining({
        id: 'legacy',
        channelId: 'private_trip_channel',
        messageId: 'message_2',
      }),
    ])
  })

  it('detaches all active trip references when a traveler is removed', async () => {
    const state = normalizeTravelState(null)
    const timestamp = '2026-01-01T00:00:00.000Z'
    state.members.push(
      {
        id: 'member_owner',
        tripId: 'trip_1',
        displayName: 'Owner',
        role: 'owner',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'member_guest',
        tripId: 'trip_1',
        displayName: 'Guest',
        role: 'traveler',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    )
    state.assignments.push({
      id: 'assignment_1',
      tripId: 'trip_1',
      title: 'Dinner',
      kind: 'place',
      sequence: 100,
      status: 'scheduled',
      participantMemberIds: ['member_owner', 'member_guest'],
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    state.expenses.push(
      expense({
        paidByMemberId: 'member_guest',
        participantMemberIds: ['member_owner', 'member_guest'],
        paidMemberIds: ['member_guest'],
        shares: [
          { memberId: 'member_owner', amount: 50 },
          { memberId: 'member_guest', amount: 50 },
        ],
      }),
    )
    state.packingBags.push({
      id: 'bag_1',
      tripId: 'trip_1',
      title: 'Shared bag',
      ownerMemberId: 'member_guest',
      memberIds: ['member_owner', 'member_guest'],
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    state.packingItems.push({
      id: 'packing_1',
      tripId: 'trip_1',
      title: 'Adapter',
      assignedToMemberId: 'member_guest',
      quantity: 1,
      packedByMemberIds: ['member_guest'],
      contributorMemberIds: ['member_owner', 'member_guest'],
      status: 'packed',
      sequence: 100,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    state.todos.push({
      id: 'todo_1',
      tripId: 'trip_1',
      title: 'Check tickets',
      assignedToMemberId: 'member_guest',
      priority: 'normal',
      status: 'open',
      sequence: 100,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const store = {
      init: async () => undefined,
      snapshot: () => state,
      read: async <T>(reader: (value: typeof state) => T | Promise<T>) => reader(state),
      write: async <T>(writer: (value: typeof state) => T | Promise<T>) => writer(state),
    }
    const dao = new TripDao(store)

    await expect(dao.removeMember('member_guest')).resolves.toMatchObject({
      id: 'member_guest',
    })
    expect(state.members.map((member) => member.id)).toEqual(['member_owner'])
    expect(state.assignments[0]?.participantMemberIds).toEqual(['member_owner'])
    expect(state.expenses[0]).toMatchObject({
      paidByMemberId: undefined,
      participantMemberIds: ['member_owner'],
      paidMemberIds: [],
      shares: [{ memberId: 'member_owner', amount: 50 }],
    })
    expect(state.packingBags[0]).toMatchObject({
      ownerMemberId: undefined,
      memberIds: ['member_owner'],
    })
    expect(state.packingItems[0]).toMatchObject({
      assignedToMemberId: undefined,
      packedByMemberIds: [],
      contributorMemberIds: ['member_owner'],
    })
    expect(state.todos[0]?.assignedToMemberId).toBeUndefined()
  })

  it('imports KML placemarks from KMZ payloads', async () => {
    const created: unknown[] = []
    const planningDao = {
      createPlaces: async (places: unknown[]) => {
        created.push(...places)
        return places
      },
    }
    const service = new PlanningService(planningDao as never)
    const fileBase64 = kmzBase64(
      'doc.kml',
      '<kml><Document><Placemark><name>Temple</name><Point><coordinates>139.76,35.68,0</coordinates></Point></Placemark></Document></kml>',
    )

    const places = await service.importPlaces('trip_1', {
      source: 'kmz',
      fileBase64,
      defaultKind: 'sight',
      tags: [],
    })

    expect(places).toHaveLength(1)
    expect(created).toHaveLength(1)
    expect(places[0]).toMatchObject({
      title: 'Temple',
      coordinates: { lat: 35.68, lng: 139.76 },
      externalRefs: { provider: 'kml' },
    })
  })

  it('builds budget analytics for chart and per-person views', async () => {
    const service = new BudgetService({} as never)
    const result = await service.analytics(
      [
        expense({ id: 'expense_food', category: 'food', amount: 100, date: '2026-03-01' }),
        expense({
          id: 'expense_hotel',
          category: 'accommodation',
          amount: 200,
          paidByMemberId: 'member_2',
          date: '2026-03-02',
        }),
        expense({ id: 'expense_waived', amount: 50, status: 'waived' }),
      ],
      { includeWaived: false },
    )

    expect(result.totals).toEqual([{ currency: 'USD', amount: 300 }])
    expect(result.perPerson).toEqual([{ currency: 'USD', amount: 150 }])
    expect(result.byCategory).toEqual([
      { category: 'accommodation', currency: 'USD', amount: 200, count: 1 },
      { category: 'food', currency: 'USD', amount: 100, count: 1 },
    ])
    expect(result.settlement[0]?.transfers).toEqual([
      { fromMemberId: 'member_1', toMemberId: 'member_2', amount: 50 },
    ])
  })

  it('suggests packing items from trip context without duplicating existing items', () => {
    const service = new PackingService({} as never)
    const result = service.suggestItems(
      {
        activities: ['hike'],
        includeExisting: false,
        limit: 40,
      },
      {
        trip: {
          id: 'trip_1',
          serverId: 'local-server',
          title: 'Mountain trip',
          status: 'planning',
          timezone: 'UTC',
          currency: 'USD',
          destinationLabels: ['mountain'],
          createdByMemberId: 'member_1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        days: [
          {
            id: 'day_1',
            tripId: 'trip_1',
            date: '2026-04-01',
            timezone: 'UTC',
            weatherRef: { condition: 'rain' },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'day_2',
            tripId: 'trip_1',
            date: '2026-04-02',
            timezone: 'UTC',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        places: [],
        reservations: [
          {
            id: 'reservation_1',
            tripId: 'trip_1',
            kind: 'flight',
            title: 'Flight',
            status: 'confirmed',
            sequence: 100,
            guestIds: [],
            participantMemberIds: [],
            passengerNames: [],
            attachmentIds: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        existingItems: [
          {
            id: 'pack_1',
            tripId: 'trip_1',
            title: 'Phone charger',
            quantity: 1,
            packedByMemberIds: [],
            contributorMemberIds: [],
            status: 'needed',
            sequence: 100,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    )

    const titles = result.suggestions.map((item) => item.title)
    expect(titles).toContain('Boarding passes')
    expect(titles).toContain('Comfortable walking shoes')
    expect(titles).toContain('Umbrella or rain jacket')
    expect(titles).not.toContain('Phone charger')
  })

  it('keeps reconnectable realtime event history', () => {
    const eventBus = new TravelEventBus()
    eventBus.emit({ type: 'place.created', tripId: 'trip_1', payload: { id: 'place_1' } })
    eventBus.emit({ type: 'place.updated', tripId: 'trip_1', payload: { id: 'place_1' } })

    expect(eventBus.recentTripEvents('trip_1', 1)).toMatchObject([
      {
        id: '2',
        sequence: 2,
        type: 'place.updated',
      },
    ])
  })

  it('increments client state revisions and rejects stale writers', async () => {
    let record: Record<string, unknown> | null = null
    const service = new ClientStateService({
      find: vi.fn(async () => record),
      upsert: vi.fn(async (_selector, create) => {
        record = create(record)
        return record
      }),
    } as never)
    const selector = {
      key: 'map-layers',
      scope: 'trip' as const,
      serverId: 'server_1',
      tripId: 'trip_1',
    }

    await expect(
      service.upsert(selector, { expectedRevision: 0, value: ['journey'] }),
    ).resolves.toMatchObject({ revision: 1 })
    await expect(service.upsert(selector, { expectedRevision: 0, value: [] })).rejects.toThrow(
      'updated elsewhere',
    )
  })

  it('isolates trips and user client state between Spaces', async () => {
    const state = normalizeTravelState(null)
    const store = {
      init: async () => undefined,
      snapshot: () => state,
      read: async <T>(reader: (value: typeof state) => T | Promise<T>) => reader(state),
      write: async <T>(writer: (value: typeof state) => T | Promise<T>) => writer(state),
    }
    const tripDao = new TripDao(store)
    state.trips.push({
      id: 'trip_space_a',
      serverId: 'space_a',
      title: 'Space A trip',
      status: 'planning',
      timezone: 'UTC',
      currency: 'USD',
      destinationLabels: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    state.members.push({
      id: 'member_a',
      tripId: 'trip_space_a',
      userId: 'user_1',
      displayName: 'Traveler',
      role: 'owner',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await expect(
      new AccessPolicy(tripDao).requireTripRead(
        {
          actor: { kind: 'user', userId: 'user_1' },
          local: false,
          serverId: 'space_b',
        } as never,
        'trip_space_a',
      ),
    ).rejects.toThrow('Trip')

    const clientState = new ClientStateService(new ClientStateDao(store))
    await clientState.upsert(
      { key: 'current-trip', ownerUserId: 'user_1', scope: 'user', serverId: 'space_a' },
      { value: 'trip_space_a' },
    )
    await clientState.upsert(
      { key: 'current-trip', ownerUserId: 'user_1', scope: 'user', serverId: 'space_b' },
      { value: 'trip_space_b' },
    )
    await expect(
      clientState.get({
        key: 'current-trip',
        ownerUserId: 'user_1',
        scope: 'user',
        serverId: 'space_a',
      }),
    ).resolves.toMatchObject({ value: 'trip_space_a' })
    await expect(
      clientState.get({
        key: 'current-trip',
        ownerUserId: 'user_1',
        scope: 'user',
        serverId: 'space_b',
      }),
    ).resolves.toMatchObject({ value: 'trip_space_b' })
  })

  it('calculates emergency impact and removes a report after unique votes', async () => {
    const reports: Array<Record<string, unknown>> = []
    const dao = {
      calculateImpact: vi.fn(async () => ({
        affectedTripIds: ['trip_1'],
        journeyItemIds: ['assignment_1'],
        participantMemberIds: ['member_1'],
      })),
      create: vi.fn(async (report) => {
        reports.push(report)
        return report
      }),
      list: vi.fn(async (serverId) => reports.filter((item) => item.serverId === serverId)),
      update: vi.fn(async (id, update) => {
        const index = reports.findIndex((item) => item.id === id)
        if (index < 0) return null
        reports[index] = update(reports[index])
        return reports[index]
      }),
    }
    const service = new EmergencyReportService(dao as never)
    const context = (userId: string) =>
      ({
        requestId: `req_${userId}`,
        serverId: 'server_1',
        actor: { kind: 'user', id: userId, userId },
        startedAt: '2026-01-01T00:00:00.000Z',
        local: false,
        auth: { authenticated: true },
      }) as never
    const report = await service.create(context('user_1'), {
      title: 'Station closure',
      category: 'transport',
      severity: 'urgent',
      latitude: 48.86,
      longitude: 2.34,
      expiresAt: '2026-01-02T00:00:00.000Z',
    })

    expect(report).toMatchObject({ affectedTripIds: ['trip_1'], status: 'active' })
    for (let index = 1; index <= emergencyReportRemovalThreshold; index += 1) {
      await service.vote(context(`voter_${index}`), String(report.id))
    }
    expect(reports[0]).toMatchObject({ status: 'removed' })
    await expect(service.vote(context('voter_4'), 'missing')).rejects.toThrow('not found')
  })
})

describe('travel server API integration', () => {
  function appWithContainer(container: Partial<AppContainer>) {
    const app = new Hono<TravelHonoEnv>()
    app.use('*', async (c, next) => {
      c.set('requestContext', {
        requestId: 'req_1',
        serverId: 'local-server',
        actor: { kind: 'local', id: 'local-user', userId: 'local-user' },
        startedAt: '2026-01-01T00:00:00.000Z',
        local: true,
        auth: {
          authenticated: true,
          launchAuthenticated: false,
          oauthAuthenticated: false,
          oauthConfigured: false,
          oauthRequired: false,
        },
      })
      await next()
    })
    app.route('/api', createApiHandler(container as AppContainer))
    return app
  }

  it('mounts provider routes through the shared API handler', async () => {
    const searchPlaces = vi.fn(async (_ctx: unknown, input: { query?: string }) => ({
      places: [],
      query: input.query,
      source: 'test',
    }))
    const app = appWithContainer({
      auditUseCase: { recordRequest: vi.fn(async () => undefined) },
      providerUseCase: { searchPlaces },
    } as unknown as AppContainer)

    const response = await app.request('/api/providers/places/search?query=Paris&lang=fr')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { places: [], query: 'Paris', source: 'test' },
    })
    expect(searchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'local-server' }),
      expect.objectContaining({ lang: 'fr', query: 'Paris' }),
    )
  })

  it('routes new server endpoints through request schemas', async () => {
    const auditUseCase = { recordRequest: vi.fn(async () => undefined) }
    const planningUseCase = {
      exportRoute: vi.fn(async (_ctx, tripId, input) => ({ tripId, input })),
    }
    const budgetUseCase = {
      analytics: vi.fn(async (_ctx, tripId, input) => ({ tripId, input })),
    }
    const packingUseCase = {
      suggestItems: vi.fn(async (_ctx, tripId, input) => ({ tripId, input })),
    }
    const clientStateUseCase = {
      get: vi.fn(async (_ctx, input) => ({ ...input, revision: 1, value: ['map'] })),
      upsert: vi.fn(async (_ctx, input) => ({ ...input, revision: 2 })),
    }
    const emergencyReportUseCase = {
      create: vi.fn(async (_ctx, input) => ({ id: 'emergency_1', ...input })),
      list: vi.fn(async () => []),
      end: vi.fn(async (_ctx, reportId) => ({ id: reportId, status: 'ended' })),
      vote: vi.fn(async (_ctx, reportId) => ({ id: reportId, removalVoteUserIds: ['user_1'] })),
    }
    const collaborationUseCase = {
      getAttachmentContent: vi.fn(async () => ({
        attachment: { fileName: 'proof.txt', mimeType: 'text/plain' },
        bytes: Buffer.from('proof'),
      })),
      deleteAttachment: vi.fn(async (_ctx, tripId, attachmentId) => ({ tripId, attachmentId })),
    }
    const settlementRecord = {
      id: 'settlement_1',
      tripId: 'trip_1',
      paidTransferIds: ['member_1:member_2'],
    }
    Object.assign(budgetUseCase, {
      setSettlementTransferPaid: vi.fn(async () => settlementRecord),
    })
    const app = appWithContainer({
      auditUseCase,
      planningUseCase,
      budgetUseCase,
      packingUseCase,
      clientStateUseCase,
      collaborationUseCase,
      emergencyReportUseCase,
    } as unknown as AppContainer)

    const routeResponse = await app.request('/api/trips/trip_1/routes/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignmentIds: ['assign_1', 'assign_2'] }),
    })
    expect(routeResponse.status).toBe(200)
    await expect(routeResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        tripId: 'trip_1',
        input: { assignmentIds: ['assign_1', 'assign_2'], format: 'both', mode: 'driving' },
      },
    })

    const analyticsResponse = await app.request(
      '/api/trips/trip_1/expenses/analytics?targetCurrency=eur&includeWaived=1',
    )
    expect(analyticsResponse.status).toBe(200)
    await expect(analyticsResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        tripId: 'trip_1',
        input: { targetCurrency: 'EUR', includeWaived: true },
      },
    })

    const suggestionsResponse = await app.request('/api/trips/trip_1/packing/suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activities: ['hike'] }),
    })
    expect(suggestionsResponse.status).toBe(200)
    await expect(suggestionsResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        tripId: 'trip_1',
        input: { activities: ['hike'], includeExisting: false, limit: 40 },
      },
    })

    const clientStateResponse = await app.request('/api/client-state/map-layers', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope: 'trip', tripId: 'trip_1', value: ['journey'] }),
    })
    expect(clientStateResponse.status).toBe(200)
    await expect(clientStateResponse.json()).resolves.toMatchObject({
      ok: true,
      data: { key: 'map-layers', revision: 2, scope: 'trip', tripId: 'trip_1' },
    })
    expect(auditUseCase.recordRequest).toHaveBeenCalledTimes(3)

    const emergencyResponse = await app.request('/api/emergency-reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Station closure',
        category: 'transport',
        severity: 'urgent',
        latitude: 48.86,
        longitude: 2.34,
        expiresAt: '2026-01-02T00:00:00.000Z',
      }),
    })
    expect(emergencyResponse.status).toBe(200)
    expect(emergencyReportUseCase.create).toHaveBeenCalledOnce()

    const paidResponse = await app.request(
      '/api/trips/trip_1/expenses/settlement-records/settlement_1/transfer-paid',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transferId: 'member_1:member_2', paid: true }),
      },
    )
    expect(paidResponse.status).toBe(200)
    await expect(paidResponse.json()).resolves.toMatchObject({ ok: true, data: settlementRecord })

    const attachmentResponse = await app.request('/api/trips/trip_1/attachments/file_1/content')
    expect(attachmentResponse.status).toBe(200)
    expect(await attachmentResponse.text()).toBe('proof')
  })

  it('removes a traveler through the trip member API', async () => {
    const removed = { id: 'member_2', tripId: 'trip_1', displayName: 'Traveler' }
    const tripUseCase = {
      removeMember: vi.fn(async () => removed),
    }
    const app = appWithContainer({
      auditUseCase: { recordRequest: vi.fn(async () => undefined) },
      tripUseCase,
    } as unknown as AppContainer)

    const response = await app.request('/api/trips/trip_1/members/member_2', {
      method: 'DELETE',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: removed })
    expect(tripUseCase.removeMember).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'local-server' }),
      'trip_1',
      'member_2',
    )
  })

  it('exposes update and delete routes required by list CRUD controls', async () => {
    const tripUseCase = {
      deleteTrip: vi.fn(async () => ({ id: 'trip_1' })),
      updateMember: vi.fn(async () => ({ id: 'member_2', displayName: 'Updated traveler' })),
    }
    const packingUseCase = {
      updateBag: vi.fn(async () => ({ id: 'bag_1', title: 'Cabin bag' })),
    }
    const planningUseCase = {
      deletePlace: vi.fn(async () => ({ id: 'place_1' })),
    }
    const app = appWithContainer({
      auditUseCase: { recordRequest: vi.fn(async () => undefined) },
      packingUseCase,
      planningUseCase,
      tripUseCase,
    } as unknown as AppContainer)

    const memberResponse = await app.request('/api/trips/trip_1/members/member_2', {
      body: JSON.stringify({ displayName: 'Updated traveler', role: 'planner' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    const bagResponse = await app.request('/api/trips/trip_1/packing/bags/bag_1', {
      body: JSON.stringify({ title: 'Cabin bag', capacityNote: '12' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
    const placeResponse = await app.request('/api/trips/trip_1/places/place_1', {
      method: 'DELETE',
    })
    const tripResponse = await app.request('/api/trips/trip_1', { method: 'DELETE' })

    expect([
      memberResponse.status,
      bagResponse.status,
      placeResponse.status,
      tripResponse.status,
    ]).toEqual([200, 200, 200, 200])
    expect(tripUseCase.updateMember).toHaveBeenCalledOnce()
    expect(packingUseCase.updateBag).toHaveBeenCalledOnce()
    expect(planningUseCase.deletePlace).toHaveBeenCalledOnce()
    expect(tripUseCase.deleteTrip).toHaveBeenCalledOnce()
  })

  it('keeps the complete editable-list CRUD route contract available', () => {
    const routes = new Set(
      createApiHandler({} as AppContainer).routes.map((route) => `${route.method} ${route.path}`),
    )
    const completeCrudResources = [
      { collection: '/tags', item: '/tags/:tagId' },
      { collection: '/categories', item: '/categories/:categoryId' },
      { collection: '/trips', item: '/trips/:tripId' },
      {
        collection: '/trips/:tripId/members',
        item: '/trips/:tripId/members/:memberId',
      },
      {
        collection: '/trips/:tripId/guests',
        item: '/trips/:tripId/guests/:guestId',
      },
      { collection: '/trips/:tripId/days', item: '/trips/:tripId/days/:dayId' },
      { collection: '/trips/:tripId/places', item: '/trips/:tripId/places/:placeId' },
      {
        collection: '/trips/:tripId/assignments',
        item: '/trips/:tripId/assignments/:assignmentId',
      },
      {
        collection: '/trips/:tripId/reservations',
        item: '/trips/:tripId/reservations/:reservationId',
      },
      {
        collection: '/trips/:tripId/expenses',
        item: '/trips/:tripId/expenses/:expenseId',
      },
      {
        collection: '/trips/:tripId/packing/bags',
        item: '/trips/:tripId/packing/bags/:bagId',
      },
      {
        collection: '/trips/:tripId/packing/items',
        item: '/trips/:tripId/packing/items/:itemId',
      },
      { collection: '/trips/:tripId/todos', item: '/trips/:tripId/todos/:todoId' },
    ]

    for (const resource of completeCrudResources) {
      expect(routes, `missing GET ${resource.collection}`).toContain(`GET ${resource.collection}`)
      expect(routes, `missing POST ${resource.collection}`).toContain(`POST ${resource.collection}`)
      expect(routes, `missing PATCH ${resource.item}`).toContain(`PATCH ${resource.item}`)
      expect(routes, `missing DELETE ${resource.item}`).toContain(`DELETE ${resource.item}`)
    }

    const immutableResourceContracts = [
      ['attachments', '/trips/:tripId/attachments', '/trips/:tripId/attachments/:attachmentId'],
      ['photos', '/trips/:tripId/photos', '/trips/:tripId/photos/:photoRefId'],
      [
        'buddy bindings',
        '/trips/:tripId/buddy-bindings',
        '/trips/:tripId/buddy-bindings/:bindingId',
      ],
    ] as const
    for (const [label, collection, item] of immutableResourceContracts) {
      expect(routes, `missing GET ${label}`).toContain(`GET ${collection}`)
      expect(routes, `missing POST ${label}`).toContain(`POST ${collection}`)
      expect(routes, `missing DELETE ${label}`).toContain(`DELETE ${item}`)
    }

    expect(routes).toContain('GET /travel-intents')
    expect(routes).toContain('PUT /travel-intents/me')
    expect(routes).toContain('DELETE /travel-intents/me')
  })

  it('starts contextual discussions through the community delivery API', async () => {
    const discussion = {
      id: 'discussion_1',
      tripId: 'trip_1',
      channelId: 'channel_1',
      messageId: 'message_1',
      subjectType: 'expense',
      subjectId: 'expense_1',
      title: 'Discuss dinner cost',
    }
    const collaborationUseCase = {
      startDiscussion: vi.fn(async () => discussion),
    }
    const app = appWithContainer({
      auditUseCase: { recordRequest: vi.fn(async () => undefined) },
      collaborationUseCase,
    } as unknown as AppContainer)

    const response = await app.request('/api/trips/trip_1/discussions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectType: 'expense',
        subjectId: 'expense_1',
        title: 'Discuss dinner cost',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: discussion })
    expect(collaborationUseCase.startDiscussion).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'local-server' }),
      'trip_1',
      expect.objectContaining({ subjectType: 'expense' }),
    )
  })
})

describe('travel websocket integration', () => {
  function collectJson(socket: WebSocket) {
    const queue: Record<string, unknown>[] = []
    const waiters: Array<{
      resolve: (value: Record<string, unknown>) => void
      reject: (error: Error) => void
    }> = []
    const rejectPending = (error: Error) => {
      while (waiters.length > 0) waiters.shift()?.reject(error)
    }
    socket.on('message', (data) => {
      const parsed = JSON.parse(data.toString()) as Record<string, unknown>
      const waiter = waiters.shift()
      if (waiter) waiter.resolve(parsed)
      else queue.push(parsed)
    })
    socket.once('error', rejectPending)
    socket.once('close', (code) =>
      rejectPending(new Error(`WebSocket closed before message: ${code}`)),
    )
    socket.once('unexpected-response', (_request, response) =>
      rejectPending(
        new Error(`Unexpected WebSocket response: ${response.statusCode ?? 'unknown'}`),
      ),
    )
    return {
      next() {
        const value = queue.shift()
        if (value) return Promise.resolve(value)
        return new Promise<Record<string, unknown>>((resolve, reject) => {
          waiters.push({ resolve, reject })
        })
      },
    }
  }

  function listen(server: ReturnType<typeof createServer>) {
    return new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as AddressInfo).port)
      })
    })
  }

  function close(server: ReturnType<typeof createServer>) {
    return new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  function closeSocket(socket: WebSocket) {
    return new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        socket.terminate()
        resolve()
      }, 500)
      timer.unref()
      socket.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.close()
    })
  }

  function withTimeout<T>(promise: Promise<T>, label: string) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 1000)
      timer.unref()
      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  }

  it('serves trip room events over websocket with replay and presence', async () => {
    const eventBus = new TravelEventBus()
    eventBus.emit({ type: 'place.created', tripId: 'trip_1', payload: { id: 'place_1' } })
    eventBus.emit({ type: 'place.updated', tripId: 'trip_1', payload: { id: 'place_1' } })

    const server = createServer((_request, response) => {
      response.writeHead(404)
      response.end()
    })
    attachTravelWebSocketServer(server, {
      eventBus,
      accessPolicy: {
        requireTripRead: vi.fn(async () => ({
          trip: {
            id: 'trip_1',
            serverId: 'local-server',
            title: 'Trip',
            status: 'planning',
            timezone: 'UTC',
            currency: 'USD',
            destinationLabels: [],
            createdByMemberId: 'member_1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          member: null,
        })),
      },
    } as unknown as AppContainer)
    const port = await listen(server)
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/trips/trip_1/ws?since=1`)
    const messages = collectJson(socket)
    let freshSocket: WebSocket | null = null

    try {
      expect(await withTimeout(messages.next(), 'websocket ready')).toMatchObject({
        kind: 'ready',
        transport: 'websocket',
        tripId: 'trip_1',
      })
      expect(await withTimeout(messages.next(), 'replayed event')).toMatchObject({
        kind: 'event',
        sequence: 2,
        type: 'place.updated',
      })
      expect(await withTimeout(messages.next(), 'presence joined')).toMatchObject({
        kind: 'event',
        type: 'presence.joined',
      })

      eventBus.emit({ type: 'expense.created', tripId: 'trip_1', payload: { id: 'expense_1' } })
      expect(await withTimeout(messages.next(), 'live event')).toMatchObject({
        kind: 'event',
        type: 'expense.created',
      })

      freshSocket = new WebSocket(`ws://127.0.0.1:${port}/api/trips/trip_1/ws`)
      const freshMessages = collectJson(freshSocket)
      expect(await withTimeout(freshMessages.next(), 'fresh websocket ready')).toMatchObject({
        kind: 'ready',
        lastEventId: '4',
      })
      expect(await withTimeout(freshMessages.next(), 'fresh websocket presence')).toMatchObject({
        kind: 'event',
        type: 'presence.joined',
      })
      expect(await withTimeout(messages.next(), 'shared presence joined')).toMatchObject({
        kind: 'event',
        type: 'presence.joined',
      })

      socket.send(JSON.stringify({ type: 'ping' }))
      expect(await withTimeout(messages.next(), 'pong')).toMatchObject({
        kind: 'pong',
        tripId: 'trip_1',
      })
    } finally {
      if (freshSocket) await closeSocket(freshSocket)
      await closeSocket(socket)
      await close(server)
    }
  })
})
