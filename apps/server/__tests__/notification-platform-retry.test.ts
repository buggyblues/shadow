import { describe, expect, it, vi } from 'vitest'
import { NotificationPlatformService } from '../src/services/notification-platform.service'

function delivery(attempts: number) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    eventId: '22222222-2222-4222-8222-222222222222',
    notificationId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
    channel: 'mobile_push',
    status: 'failed',
    provider: null,
    target: null,
    payload: { title: 'Trip changed' },
    error: 'temporary failure',
    attempts,
    nextAttemptAt: new Date(),
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const
}

function serviceFor(item: ReturnType<typeof delivery>, responseStatus = 503) {
  const notificationDao = {
    claimRetryableDeliveries: vi.fn().mockResolvedValue([item]),
    updateDelivery: vi.fn().mockResolvedValue({}),
    findActivePushTokens: vi.fn().mockResolvedValue([{ token: 'ExponentPushToken[test]' }]),
  }
  const service = new NotificationPlatformService({
    notificationDao,
    notificationDeliveryService: { deliver: vi.fn() },
    userDao: { findById: vi.fn() },
    safeHttpClient: {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: responseStatus })),
    },
  } as never)
  return { notificationDao, service }
}

describe('NotificationPlatformService delivery retries', () => {
  it('schedules a failed delivery with exponential backoff', async () => {
    const { notificationDao, service } = serviceFor(delivery(0))
    const before = Date.now()
    await expect(service.processDueDeliveries()).resolves.toMatchObject({
      claimed: 1,
      failed: 1,
      deadLettered: 0,
    })
    expect(notificationDao.updateDelivery).toHaveBeenCalledWith(
      delivery(0).id,
      expect.objectContaining({
        attempts: 1,
        status: 'failed',
        nextAttemptAt: expect.any(Date),
      }),
    )
    const patch = notificationDao.updateDelivery.mock.calls[0]?.[1]
    expect(patch.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 29_000)
  })

  it('moves a delivery to dead letter after the final attempt', async () => {
    const { notificationDao, service } = serviceFor(delivery(4))
    await expect(service.processDueDeliveries()).resolves.toMatchObject({ deadLettered: 1 })
    expect(notificationDao.updateDelivery).toHaveBeenCalledWith(
      delivery(4).id,
      expect.objectContaining({ attempts: 5, nextAttemptAt: null, status: 'dead_letter' }),
    )
  })

  it('clears retry state after a successful replay', async () => {
    const { notificationDao, service } = serviceFor(delivery(2), 200)
    await expect(service.processDueDeliveries()).resolves.toMatchObject({ sent: 1 })
    expect(notificationDao.updateDelivery).toHaveBeenCalledWith(
      delivery(2).id,
      expect.objectContaining({ error: null, nextAttemptAt: null, status: 'sent' }),
    )
  })
})
