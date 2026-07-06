import { Files, LayoutGrid, Loader2, PanelBottom } from 'lucide-react'
import { type MouseEvent, memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ServerIcon } from '../../components/server/server-icon'
import { AppIcon, OsDockButton, OsDockSeparator } from './components'
import { OsDockAppStack, type OsDockAppStackEntry, OsDockWindowStack } from './dock-stacks'
import type { OsBuiltinAppKey, OsWindowState, ServerAppIntegration, ServerEntry } from './types'

type BuiltinDockApp = {
  key: OsBuiltinAppKey
  label: string
  icon: ReactNode
}

function builtinDockIconKey(key: OsBuiltinAppKey) {
  return `builtin:${key}`
}

function appDockIconKey(appKey: string) {
  return `app:${appKey}`
}

export const OsDockBar = memo(function OsDockBar({
  activeBuiltinWindows,
  dockAppStackEntries,
  focusedWindowId,
  hasInstalledDockApps,
  hasQuickStacks,
  isAppsLoading,
  minimizedWindowStack,
  selectedServer,
  topAppWindows,
  visibleBuiltinDockApps,
  visibleDockApps,
  workspaceFileStack,
  onFocusWindow,
  onOpenAppWindow,
  onOpenBuiltinWindow,
  onOpenDockIconContextMenu,
}: {
  activeBuiltinWindows: Set<OsBuiltinAppKey>
  dockAppStackEntries: OsDockAppStackEntry[]
  focusedWindowId: string | null
  hasInstalledDockApps: boolean
  hasQuickStacks: boolean
  isAppsLoading: boolean
  minimizedWindowStack: OsWindowState[]
  selectedServer: ServerEntry
  topAppWindows: Array<string | undefined>
  visibleBuiltinDockApps: BuiltinDockApp[]
  visibleDockApps: ServerAppIntegration[]
  workspaceFileStack: OsWindowState[]
  onFocusWindow: (id: string) => void
  onOpenAppWindow: (app: ServerAppIntegration) => void
  onOpenBuiltinWindow: (key: OsBuiltinAppKey) => void
  onOpenDockIconContextMenu: (event: MouseEvent, iconKey: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className="absolute bottom-1 left-1/2 z-[450] flex max-w-[calc(100%-1.25rem)] -translate-x-1/2 select-none items-center gap-1 overflow-visible rounded-[18px] border border-white/18 bg-black/28 px-1.5 py-1 shadow-[0_16px_52px_rgba(0,0,0,0.30)] backdrop-blur-2xl"
      data-os-dock-bar="true"
    >
      <OsDockButton
        active
        label={selectedServer.server.name}
        icon={
          <ServerIcon
            iconUrl={selectedServer.server.iconUrl}
            name={selectedServer.server.name}
            size="sm"
            variant="plain"
            isPublic={selectedServer.server.isPublic}
          />
        }
        onClick={() => onOpenBuiltinWindow('server-settings')}
        surface="bare"
        wrapIcon={false}
      />
      <OsDockSeparator visible={visibleBuiltinDockApps.length > 0} />
      {visibleBuiltinDockApps.map((app) => (
        <OsDockButton
          key={app.key}
          active={activeBuiltinWindows.has(app.key)}
          label={app.label}
          icon={app.icon}
          onClick={() => onOpenBuiltinWindow(app.key)}
          onContextMenu={(event) => onOpenDockIconContextMenu(event, builtinDockIconKey(app.key))}
        />
      ))}
      <OsDockSeparator visible={hasInstalledDockApps} />
      {isAppsLoading ? (
        <OsDockButton
          label={t('common.loading')}
          icon={<Loader2 size={18} className="animate-spin" />}
          onClick={() => undefined}
        />
      ) : (
        visibleDockApps.map((app) => (
          <OsDockButton
            key={app.id}
            active={topAppWindows.includes(app.appKey)}
            label={app.name}
            icon={<AppIcon iconUrl={app.iconUrl} className="rounded-xl" />}
            onClick={() => onOpenAppWindow(app)}
            onContextMenu={(event) => onOpenDockIconContextMenu(event, appDockIconKey(app.appKey))}
          />
        ))
      )}
      <OsDockSeparator visible={hasQuickStacks} />
      <OsDockAppStack
        label={t('os.applications')}
        icon={<LayoutGrid size={19} />}
        entries={dockAppStackEntries}
      />
      <OsDockWindowStack
        stackKey="files"
        label={t('os.workspaceFiles')}
        icon={<Files size={19} />}
        windows={workspaceFileStack}
        focusedWindowId={focusedWindowId}
        onSelect={onFocusWindow}
      />
      <OsDockWindowStack
        stackKey="minimized"
        label={t('os.minimizedWindows')}
        icon={<PanelBottom size={19} />}
        windows={minimizedWindowStack}
        focusedWindowId={focusedWindowId}
        onSelect={onFocusWindow}
      />
    </div>
  )
})
