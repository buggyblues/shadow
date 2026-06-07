import type { DesktopContainer } from '../core/container'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerNotificationHandlers(container: DesktopContainer): void {
  const { notificationsService } = container.cradle

  const notifications = {
    show: (input) => notificationsService.showNotification(input),
    setBadgeCount: (count) => notificationsService.setBadgeCount(count),
    setMode: (mode) => notificationsService.setNotificationMode(mode),
  } satisfies DesktopIPCServiceImplementation<'notifications'>

  registerDesktopIPCService('notifications', notifications)
}
