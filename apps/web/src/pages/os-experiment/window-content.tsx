import { useTranslation } from 'react-i18next'
import { UniversalFilePreviewPanel } from '../../components/file-preview/universal-file-preview-panel'
import { ServerSettingsModal } from '../../components/server/server-settings-modal'
import { ShopPage } from '../../components/shop/shop-page'
import { WorkspaceWorkbench } from '../../components/workspace/WorkspaceWorkbench'
import { WorkspacePage } from '../../components/workspace/workspace-page'
import type { AuthenticatedUser } from '../../lib/auth-session'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { OsContactsContent, OsMyBuddyContent } from '../buddy-management'
import { ComputersPage } from '../computers'
import { DiscoverPage } from '../discover'
import { TaskSettings } from '../settings/tasks'
import { WalletSettings } from '../settings/wallet'
import { UserProfilePage } from '../user-profile'
import { OsAppStoreContent } from './app-store'
import { OsWindowLayout } from './components/window-layout'
import { OsSettingsWindowContent } from './settings-window'
import type { OsWindowState, ServerEntry, SpaceAppInstallation } from './types'

export function OsBuiltinWindowContent({
  item,
  serverSlug,
  selectedServer,
  user,
  apps,
  isAppsLoading,
  onOpenApp,
  onOpenWorkspaceFile,
  onPinWorkspaceFile,
  onCloseWindow,
}: {
  item: OsWindowState
  serverSlug: string
  selectedServer: ServerEntry
  user: AuthenticatedUser | null | undefined
  apps: SpaceAppInstallation[]
  isAppsLoading: boolean
  onOpenApp: (app: SpaceAppInstallation) => void
  onOpenWorkspaceFile: (node: WorkspaceNode) => void
  onPinWorkspaceFile?: (node: WorkspaceNode) => void
  onCloseWindow: (id: string) => void
}) {
  const { t } = useTranslation()

  if (item.builtinKey === 'settings') {
    return <OsSettingsWindowContent initialTab={item.settingsTab} />
  }

  if (item.builtinKey === 'cloud-computers') {
    return (
      <ComputersPage initialComputerId={item.cloudComputerId} spaceId={selectedServer.server.id} />
    )
  }

  if (item.builtinKey === 'discover') {
    return (
      <OsWindowLayout>
        <DiscoverPage embedded initialView="browse" />
      </OsWindowLayout>
    )
  }

  if (item.builtinKey === 'my-buddies') {
    return (
      <OsWindowLayout>
        <OsMyBuddyContent
          initialSection={item.buddySection ?? 'buddies'}
          initialDirectChannelId={item.buddyDirectChannelId}
          initialAgentId={item.buddyAgentId}
        />
      </OsWindowLayout>
    )
  }

  if (item.builtinKey === 'contacts') {
    return (
      <OsWindowLayout>
        <OsContactsContent />
      </OsWindowLayout>
    )
  }

  if (item.builtinKey === 'tasks') {
    return (
      <OsWindowLayout padded scroll>
        <TaskSettings />
      </OsWindowLayout>
    )
  }

  if (item.builtinKey === 'wallet') {
    return (
      <OsWindowLayout padded scroll>
        <WalletSettings embedded />
      </OsWindowLayout>
    )
  }

  if (item.builtinKey === 'server-settings') {
    return (
      <ServerSettingsModal
        open
        embedded
        server={{
          id: selectedServer.server.id,
          name: selectedServer.server.name,
          description: selectedServer.server.description,
          slug: selectedServer.server.slug ?? serverSlug,
          iconUrl: selectedServer.server.iconUrl,
          bannerUrl: selectedServer.server.bannerUrl,
          isPublic: Boolean(selectedServer.server.isPublic),
          inviteCode: selectedServer.server.inviteCode ?? '',
          ownerId: selectedServer.server.ownerId ?? '',
        }}
        serverSlug={serverSlug}
        onClose={() => onCloseWindow(item.id)}
      />
    )
  }

  if (item.builtinKey === 'profile') {
    return (
      <UserProfilePage
        userId={item.profileUserId ?? user?.id}
        embedded
        onClose={() => onCloseWindow(item.id)}
      />
    )
  }

  if (item.builtinKey === 'workspace') {
    return (
      <OsWindowLayout>
        <WorkspacePage
          serverId={serverSlug}
          embedded
          collapsibleSidebar
          initialNodeId={item.workspaceNode?.id}
          initialPath={item.workspaceNode?.path}
          onOpenFile={onOpenWorkspaceFile}
          onPinFileToDesktop={onPinWorkspaceFile}
        />
      </OsWindowLayout>
    )
  }

  if (item.builtinKey === 'shop') {
    return (
      <ShopPage
        serverId={serverSlug}
        isAdmin={selectedServer.server.ownerId === user?.id}
        embedded
      />
    )
  }

  if (item.builtinKey === 'app-store') {
    return (
      <OsAppStoreContent
        serverSlug={serverSlug}
        apps={apps}
        isLoading={isAppsLoading}
        onOpenApp={onOpenApp}
      />
    )
  }

  return (
    <div className="grid h-full min-h-0 w-full min-w-0 flex-1 place-items-center text-sm font-bold text-text-muted">
      {t('os.windowUnavailable')}
    </div>
  )
}

export function OsFileWindowContent({
  item,
  serverSlug,
  onCloseWindow,
}: {
  item: OsWindowState
  serverSlug: string
  onCloseWindow: (id: string) => void
}) {
  if (item.kind === 'workspace-file' && item.workspaceNode) {
    return (
      <div className="h-full min-h-0 w-full min-w-0 overflow-hidden">
        <WorkspaceWorkbench
          node={item.workspaceNode}
          serverId={serverSlug}
          onClose={() => onCloseWindow(item.id)}
          windowMenu
        />
      </div>
    )
  }

  if (item.kind === 'chat-file' && item.attachment) {
    return (
      <div className="h-full min-h-0 w-full min-w-0 overflow-hidden">
        <UniversalFilePreviewPanel
          attachment={item.attachment}
          presentation="embedded"
          onClose={() => onCloseWindow(item.id)}
          windowMenu
        />
      </div>
    )
  }

  return null
}
