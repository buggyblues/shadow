import type { TravelDataStore } from '../db/database.js'
import type { TravelNotification } from '../types.js'

export class NotificationDao {
  constructor(private readonly db: TravelDataStore) {}

  listNotifications(
    serverId: string,
    options: { tripId?: string; unreadForMemberId?: string } = {},
  ) {
    return this.db.read((state) =>
      state.notifications
        .filter((notification) => notification.serverId === serverId)
        .filter((notification) => !options.tripId || notification.tripId === options.tripId)
        .filter(
          (notification) =>
            !options.unreadForMemberId ||
            !notification.readByMemberIds.includes(options.unreadForMemberId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  findNotification(serverId: string, notificationId: string) {
    return this.db.read(
      (state) =>
        state.notifications.find(
          (notification) =>
            notification.serverId === serverId && notification.id === notificationId,
        ) ?? null,
    )
  }

  createNotification(notification: TravelNotification) {
    return this.db.write((state) => {
      state.notifications.push(notification)
      return notification
    })
  }

  markRead(serverId: string, notificationId: string, memberId: string, read: boolean) {
    return this.db.write((state) => {
      const notification = state.notifications.find(
        (item) => item.serverId === serverId && item.id === notificationId,
      )
      if (!notification) return null
      if (read && !notification.readByMemberIds.includes(memberId)) {
        notification.readByMemberIds.push(memberId)
      }
      if (!read) {
        notification.readByMemberIds = notification.readByMemberIds.filter((id) => id !== memberId)
      }
      return notification
    })
  }

  markAllRead(serverId: string, memberId: string, tripId?: string) {
    return this.db.write((state) => {
      const notifications = state.notifications.filter(
        (notification) =>
          notification.serverId === serverId && (!tripId || notification.tripId === tripId),
      )
      for (const notification of notifications) {
        if (!notification.readByMemberIds.includes(memberId)) {
          notification.readByMemberIds.push(memberId)
        }
      }
      return notifications
    })
  }
}
