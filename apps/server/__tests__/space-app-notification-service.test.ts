import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpaceAppNotificationService } from '../src/services/space-app-notification.service'

const app = {
  id: '11111111-1111-4111-8111-111111111111',
  serverId: '22222222-2222-4222-8222-222222222222',
  appKey: 'planner',
  name: 'Planner',
  iconUrl: null,
  manifest: {
    notifications: [
      {
        key: 'task.changed',
        title: 'Task changes',
        defaultChannels: ['in_app', 'mobile_push'] as const,
      },
    ],
  },
}

function createService() {
  const deps = {
    spaceAppDao: {
      findById: vi.fn().mockResolvedValue(app),
      findByServerAndKey: vi.fn().mockResolvedValue(app),
      listByServer: vi.fn().mockResolvedValue([app]),
    },
    notificationDao: {
      syncSpaceAppTopics: vi.fn().mockResolvedValue(undefined),
      findSpaceAppTopic: vi.fn().mockResolvedValue({
        spaceAppId: app.id,
        serverId: app.serverId,
        appKey: app.appKey,
        topicKey: 'task.changed',
        title: 'Task changes',
        description: null,
        defaultEnabled: true,
        defaultChannels: ['in_app', 'mobile_push'],
      }),
      getSpaceAppPreference: vi.fn().mockResolvedValue(null),
      upsertSpaceAppPreference: vi.fn(),
      listSpaceAppTopicsForUser: vi.fn().mockResolvedValue([]),
    },
    notificationService: {
      create: vi.fn().mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        userId: '44444444-4444-4444-8444-444444444444',
        type: 'system',
        kind: 'space-app.planner.task.changed',
        isRead: false,
      }),
    },
    notificationPlatformService: { deliver: vi.fn().mockResolvedValue({}) },
    serverDao: {
      getMember: vi.fn().mockResolvedValue({ role: 'member' }),
      findByUserId: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue({ id: app.serverId, name: 'Design Space' }),
    },
    auditLogService: { record: vi.fn().mockResolvedValue(undefined) },
  }
  return { service: new SpaceAppNotificationService(deps as never), deps }
}

describe('SpaceAppNotificationService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('publishes declared topics only to current Space members', async () => {
    const { service, deps } = createService()
    const result = await service.publish({
      app,
      actor: '55555555-5555-4555-8555-555555555555',
      topicKey: 'task.changed',
      recipientUserIds: ['44444444-4444-4444-8444-444444444444'],
      title: 'A task changed',
      idempotencyKey: 'event-12345678',
      actionPath: '/tasks/1',
    })

    expect(result.results).toEqual([
      expect.objectContaining({ status: 'delivered', notificationId: expect.any(String) }),
    ])
    expect(deps.notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSpaceAppId: app.id,
        sourceSpaceAppKey: app.appKey,
        sourceSpaceAppTopicKey: 'task.changed',
      }),
    )
    expect(deps.notificationPlatformService.deliver).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabledChannels: ['in_app', 'mobile_push'] }),
    )
  })

  it('rejects recipients outside the Space before creating notifications', async () => {
    const { service, deps } = createService()
    deps.serverDao.getMember.mockResolvedValueOnce(null)
    await expect(
      service.publish({
        app,
        actor: '55555555-5555-4555-8555-555555555555',
        topicKey: 'task.changed',
        recipientUserIds: ['44444444-4444-4444-8444-444444444444'],
        title: 'A task changed',
        idempotencyKey: 'event-12345678',
      }),
    ).rejects.toMatchObject({ status: 403, reason: 'recipient_outside_space' })
    expect(deps.notificationService.create).not.toHaveBeenCalled()
  })

  it('honors a disabled user preference', async () => {
    const { service, deps } = createService()
    deps.notificationDao.getSpaceAppPreference.mockResolvedValueOnce({
      enabled: false,
      channels: ['in_app'],
    })
    const result = await service.publish({
      app,
      actor: '55555555-5555-4555-8555-555555555555',
      topicKey: 'task.changed',
      recipientUserIds: ['44444444-4444-4444-8444-444444444444'],
      title: 'A task changed',
      idempotencyKey: 'event-12345678',
    })
    expect(result.results).toEqual([
      { userId: '44444444-4444-4444-8444-444444444444', status: 'skipped' },
    ])
    expect(deps.notificationService.create).not.toHaveBeenCalled()
  })
})
