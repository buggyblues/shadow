import { describe, expectTypeOf, it } from 'vitest'
import type { ShadowClient } from '../../sdk/src/client'

/**
 * Type checking tests - these verify that our CLI commands
 * use SDK methods with correct signatures
 *
 * These tests compile-time check the method signatures
 */
describe('SDK Method Signatures', () => {
  it('should have correct apps method signatures', () => {
    expectTypeOf<ShadowClient['listApps']>().toEqualTypeOf<(serverId: string) => Promise<unknown>>()
    expectTypeOf<ShadowClient['getApp']>().toEqualTypeOf<
      (serverId: string, appId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['deleteApp']>().toEqualTypeOf<
      (serverId: string, appId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['publishApp']>().toEqualTypeOf<
      (serverId: string, data: { name: string; slug: string }) => Promise<unknown>
    >()
  })

  it('should have correct dms method signatures', () => {
    expectTypeOf<ShadowClient['listDmChannels']>().toEqualTypeOf<() => Promise<unknown>>()
    expectTypeOf<ShadowClient['createDmChannel']>().toEqualTypeOf<
      (userId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['getDmMessages']>().toEqualTypeOf<
      (channelId: string, limit?: number, cursor?: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['sendDmMessage']>().toEqualTypeOf<
      (channelId: string, content: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['markScopeRead']>().toEqualTypeOf<
      (scope: { serverId?: string; channelId?: string; dmChannelId?: string }) => Promise<unknown>
    >()
  })

  it('should have correct friends method signatures', () => {
    expectTypeOf<ShadowClient['listFriends']>().toEqualTypeOf<() => Promise<unknown>>()
    expectTypeOf<ShadowClient['sendFriendRequest']>().toEqualTypeOf<
      (username: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['acceptFriendRequest']>().toEqualTypeOf<
      (requestId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['rejectFriendRequest']>().toEqualTypeOf<
      (requestId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['removeFriend']>().toEqualTypeOf<
      (friendshipId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['listPendingFriendRequests']>().toEqualTypeOf<
      () => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['listSentFriendRequests']>().toEqualTypeOf<() => Promise<unknown>>()
  })

  it('should have correct marketplace method signatures', () => {
    expectTypeOf<ShadowClient['browseListings']>().toEqualTypeOf<
      (params?: {
        search?: string
        tags?: string[]
        minPrice?: number
        maxPrice?: number
        limit?: number
        offset?: number
      }) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['getListing']>().toEqualTypeOf<
      (listingId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['createListing']>().toEqualTypeOf<
      (data: {
        agentId: string
        pricePerHour: number
        title: string
        description?: string
        tags?: string[]
      }) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['updateListing']>().toEqualTypeOf<
      (
        listingId: string,
        data: Partial<{ title: string; description: string; pricePerHour: number; tags: string[] }>,
      ) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['deleteListing']>().toEqualTypeOf<
      (listingId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['signContract']>().toEqualTypeOf<
      (data: { listingId: string; hours: number }) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['listContracts']>().toEqualTypeOf<
      (params?: { role?: 'tenant' | 'owner'; status?: string }) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['getContract']>().toEqualTypeOf<
      (contractId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['terminateContract']>().toEqualTypeOf<
      (contractId: string) => Promise<unknown>
    >()
  })

  it('should have correct media method signatures', () => {
    expectTypeOf<ShadowClient['uploadMedia']>().toEqualTypeOf<
      (file: Blob, filename: string, scope?: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['downloadFile']>().toEqualTypeOf<
      (contentRef: string) => Promise<Response>
    >()
  })

  it('should have correct notifications method signatures', () => {
    expectTypeOf<ShadowClient['listNotifications']>().toEqualTypeOf<
      (limit?: number, offset?: number) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['markNotificationRead']>().toEqualTypeOf<
      (notificationId: string) => Promise<unknown>
    >()
    expectTypeOf<ShadowClient['markAllNotificationsRead']>().toEqualTypeOf<() => Promise<unknown>>()
    expectTypeOf<ShadowClient['getNotificationPreferences']>().toEqualTypeOf<
      () => Promise<unknown>
    >()
  })
})
