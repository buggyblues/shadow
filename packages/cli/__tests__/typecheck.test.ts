import { ShadowClient } from '@shadowob/sdk'
import { describe, expect, it } from 'vitest'

/**
 * Type checking tests - these verify that our CLI commands
 * use SDK methods with correct signatures
 *
 * These tests compile-time check the method signatures
 */
describe('SDK Method Signatures', () => {
  it('should have correct apps method signatures', () => {
    // listApps(serverId: string)
    const listApps: (serverId: string) => Promise<unknown> = ShadowClient.prototype.listApps
    expect(typeof listApps).toBe('function')

    // getApp(serverId: string, appId: string)
    const getApp: (serverId: string, appId: string) => Promise<unknown> =
      ShadowClient.prototype.getApp
    expect(typeof getApp).toBe('function')

    // deleteApp(serverId: string, appId: string)
    const deleteApp: (serverId: string, appId: string) => Promise<unknown> =
      ShadowClient.prototype.deleteApp
    expect(typeof deleteApp).toBe('function')

    // publishApp(serverId: string, data: { name: string, slug: string })
    const publishApp: (serverId: string, data: { name: string; slug: string }) => Promise<unknown> =
      ShadowClient.prototype.publishApp
    expect(typeof publishApp).toBe('function')
  })

  it('should have correct dms method signatures', () => {
    // listDmChannels()
    const listDmChannels: () => Promise<unknown> = ShadowClient.prototype.listDmChannels
    expect(typeof listDmChannels).toBe('function')

    // createDmChannel(userId: string)
    const createDmChannel: (userId: string) => Promise<unknown> =
      ShadowClient.prototype.createDmChannel
    expect(typeof createDmChannel).toBe('function')

    // getDmMessages(channelId: string, limit?: number, cursor?: string)
    const getDmMessages: (channelId: string, limit?: number, cursor?: string) => Promise<unknown> =
      ShadowClient.prototype.getDmMessages
    expect(typeof getDmMessages).toBe('function')

    // sendDmMessage(channelId: string, content: string)
    const sendDmMessage: (channelId: string, content: string) => Promise<unknown> =
      ShadowClient.prototype.sendDmMessage
    expect(typeof sendDmMessage).toBe('function')

    // markScopeRead(scope: { serverId?: string, channelId?: string, dmChannelId?: string })
    const markScopeRead: (scope: {
      serverId?: string
      channelId?: string
      dmChannelId?: string
    }) => Promise<unknown> = ShadowClient.prototype.markScopeRead
    expect(typeof markScopeRead).toBe('function')
  })

  it('should have correct friends method signatures', () => {
    // listFriends()
    const listFriends: () => Promise<unknown> = ShadowClient.prototype.listFriends
    expect(typeof listFriends).toBe('function')

    // sendFriendRequest(username: string)
    const sendFriendRequest: (username: string) => Promise<unknown> =
      ShadowClient.prototype.sendFriendRequest
    expect(typeof sendFriendRequest).toBe('function')

    // acceptFriendRequest(requestId: string)
    const acceptFriendRequest: (requestId: string) => Promise<unknown> =
      ShadowClient.prototype.acceptFriendRequest
    expect(typeof acceptFriendRequest).toBe('function')

    // rejectFriendRequest(requestId: string)
    const rejectFriendRequest: (requestId: string) => Promise<unknown> =
      ShadowClient.prototype.rejectFriendRequest
    expect(typeof rejectFriendRequest).toBe('function')

    // removeFriend(friendshipId: string)
    const removeFriend: (friendshipId: string) => Promise<unknown> =
      ShadowClient.prototype.removeFriend
    expect(typeof removeFriend).toBe('function')

    // listPendingFriendRequests()
    const listPendingFriendRequests: () => Promise<unknown> =
      ShadowClient.prototype.listPendingFriendRequests
    expect(typeof listPendingFriendRequests).toBe('function')

    // listSentFriendRequests()
    const listSentFriendRequests: () => Promise<unknown> =
      ShadowClient.prototype.listSentFriendRequests
    expect(typeof listSentFriendRequests).toBe('function')
  })

  it('should have correct marketplace method signatures', () => {
    // browseListings(params?: { search?: string, tags?: string[], minPrice?: number, maxPrice?: number, limit?: number, offset?: number })
    const browseListings: (params?: {
      search?: string
      tags?: string[]
      minPrice?: number
      maxPrice?: number
      limit?: number
      offset?: number
    }) => Promise<unknown> = ShadowClient.prototype.browseListings
    expect(typeof browseListings).toBe('function')

    // getListing(listingId: string)
    const getListing: (listingId: string) => Promise<unknown> = ShadowClient.prototype.getListing
    expect(typeof getListing).toBe('function')

    // createListing(data: { agentId: string, pricePerHour: number, title: string, description?: string, tags?: string[] })
    const createListing: (data: {
      agentId: string
      pricePerHour: number
      title: string
      description?: string
      tags?: string[]
    }) => Promise<unknown> = ShadowClient.prototype.createListing
    expect(typeof createListing).toBe('function')

    // updateListing(listingId: string, data: Partial<...>)
    const updateListing: (
      listingId: string,
      data: Partial<{ title: string; description: string; pricePerHour: number; tags: string[] }>,
    ) => Promise<unknown> = ShadowClient.prototype.updateListing
    expect(typeof updateListing).toBe('function')

    // deleteListing(listingId: string)
    const deleteListing: (listingId: string) => Promise<unknown> =
      ShadowClient.prototype.deleteListing
    expect(typeof deleteListing).toBe('function')

    // signContract(data: { listingId: string, hours: number })
    const signContract: (data: { listingId: string; hours: number }) => Promise<unknown> =
      ShadowClient.prototype.signContract
    expect(typeof signContract).toBe('function')

    // listContracts(params?: { role?: 'tenant' | 'owner', status?: string })
    const listContracts: (params?: {
      role?: 'tenant' | 'owner'
      status?: string
    }) => Promise<unknown> = ShadowClient.prototype.listContracts
    expect(typeof listContracts).toBe('function')

    // getContract(contractId: string)
    const getContract: (contractId: string) => Promise<unknown> = ShadowClient.prototype.getContract
    expect(typeof getContract).toBe('function')

    // terminateContract(contractId: string)
    const terminateContract: (contractId: string) => Promise<unknown> =
      ShadowClient.prototype.terminateContract
    expect(typeof terminateContract).toBe('function')
  })

  it('should have correct media method signatures', () => {
    // uploadMedia(file: Blob, filename: string, scope?: string)
    const uploadMedia: (file: Blob, filename: string, scope?: string) => Promise<unknown> =
      ShadowClient.prototype.uploadMedia
    expect(typeof uploadMedia).toBe('function')

    // downloadFile(contentRef: string)
    const downloadFile: (contentRef: string) => Promise<Response> =
      ShadowClient.prototype.downloadFile
    expect(typeof downloadFile).toBe('function')
  })

  it('should have correct notifications method signatures', () => {
    // listNotifications(limit?: number, offset?: number)
    const listNotifications: (limit?: number, offset?: number) => Promise<unknown> =
      ShadowClient.prototype.listNotifications
    expect(typeof listNotifications).toBe('function')

    // markNotificationRead(notificationId: string)
    const markNotificationRead: (notificationId: string) => Promise<unknown> =
      ShadowClient.prototype.markNotificationRead
    expect(typeof markNotificationRead).toBe('function')

    // markAllNotificationsRead()
    const markAllNotificationsRead: () => Promise<unknown> =
      ShadowClient.prototype.markAllNotificationsRead
    expect(typeof markAllNotificationsRead).toBe('function')

    // getNotificationPreferences()
    const getNotificationPreferences: () => Promise<unknown> =
      ShadowClient.prototype.getNotificationPreferences
    expect(typeof getNotificationPreferences).toBe('function')
  })
})
