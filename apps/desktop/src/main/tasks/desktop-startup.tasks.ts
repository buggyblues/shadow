import type { DesktopContainer } from '../core/container'
import { type DesktopTask, DesktopTaskQueue } from '../core/task-queue'
import type { DesktopRuntimeSettings } from '../services/desktop-settings.service'

type StartupShellTasks = {
  createAppMenu: () => void
  createTray: () => void
  registerGlobalShortcuts: () => void
  shouldShowPetWindow: () => boolean
  showPetWindow: () => void
}

type StartupSettingsTasks = {
  applyNetworkSettings: () => void | Promise<void>
  onSettingsApplied: (listener: (settings: DesktopRuntimeSettings) => void) => () => void
  showPetWindow: () => void
  hidePetWindow: () => void
  syncCommunityAuthState: (reason: 'settings') => void | Promise<void>
  syncDesktopPetVisibility: (settings: DesktopRuntimeSettings, reason: 'settings') => void
}

type StartupBackgroundTasks = {
  container: DesktopContainer
  startConnectorDaemonIfEnabled: () => void | Promise<void>
}

type StartupFoundationTasks = {
  ensureDockIcon: () => void
  registerDeepLinkProtocol: () => void
  registerPermissionHandlers: () => void
  setAppIdentity: () => void
}

type StartupIpcTasks = {
  registerHandlers: () => void
}

export class DesktopStartupTasks {
  private readonly queue = new DesktopTaskQueue('desktop.startup')

  runFoundation(tasks: StartupFoundationTasks): Promise<void> {
    return this.queue.runSerial([
      { name: 'app.identity', run: tasks.setAppIdentity },
      { name: 'protocol.deep-link', run: tasks.registerDeepLinkProtocol },
      { name: 'dock-icon.ensure', run: tasks.ensureDockIcon },
      { name: 'permissions.register', run: tasks.registerPermissionHandlers },
    ])
  }

  runRuntime(tasks: StartupIpcTasks & StartupSettingsTasks): Promise<void> {
    return this.queue.runSerial([
      { name: 'ipc.register', run: tasks.registerHandlers },
      {
        name: 'settings.listeners',
        run: () => {
          tasks.onSettingsApplied(() => {
            void tasks.syncCommunityAuthState('settings')
          })
          tasks.onSettingsApplied((settings) => {
            tasks.syncDesktopPetVisibility(settings, 'settings')
            if (settings.desktopPetVisible) tasks.showPetWindow()
            else tasks.hidePetWindow()
          })
        },
      },
      { name: 'network.apply', run: tasks.applyNetworkSettings },
    ])
  }

  runShell(tasks: StartupShellTasks): Promise<void> {
    return this.queue.runSerial([
      {
        name: 'shell.register',
        run: () => {
          if (tasks.shouldShowPetWindow()) tasks.showPetWindow()
          tasks.createTray()
          tasks.createAppMenu()
          tasks.registerGlobalShortcuts()
        },
      },
    ])
  }

  runBackground(tasks: StartupBackgroundTasks): void {
    const backgroundTasks: DesktopTask[] = [
      {
        name: 'auto-updater.setup',
        run: () => tasks.container.cradle.autoUpdaterService.initialize(),
      },
      {
        name: 'connector.auto-start',
        run: tasks.startConnectorDaemonIfEnabled,
      },
    ]

    for (const task of backgroundTasks) {
      this.queue.runBackground(task)
    }
  }
}
