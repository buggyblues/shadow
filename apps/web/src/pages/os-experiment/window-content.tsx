import { Loader2 } from 'lucide-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { UniversalFilePreviewPanel } from '../../components/file-preview/universal-file-preview-panel'
import { ServerSettingsModal } from '../../components/server/server-settings-modal'
import { ShopPage } from '../../components/shop/shop-page'
import { WorkspaceWorkbench } from '../../components/workspace/WorkspaceWorkbench'
import { WorkspacePage } from '../../components/workspace/workspace-page'
import type { AuthenticatedUser } from '../../lib/auth-session'
import { CloudSaasApp } from '../../lib/cloud-saas-app'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { MyBuddySettingsContent } from '../buddy-management'
import { CloudComputersPage } from '../cloud-computers'
import { DiscoverPage } from '../discover'
import { UserProfilePage } from '../user-profile'
import { OsAppStoreContent } from './app-store'
import { OsSettingsWindowContent } from './settings-window'
import type { OsWindowState, ServerAppIntegration, ServerEntry } from './types'

function OsEmbeddedLoadingPane() {
  const { t } = useTranslation()

  return (
    <div className="grid h-full min-h-0 w-full min-w-0 flex-1 place-items-center text-sm font-bold text-text-muted">
      <span className="inline-flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" />
        {t('common.loading')}
      </span>
    </div>
  )
}

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
  apps: ServerAppIntegration[]
  isAppsLoading: boolean
  onOpenApp: (app: ServerAppIntegration) => void
  onOpenWorkspaceFile: (node: WorkspaceNode) => void
  onPinWorkspaceFile?: (node: WorkspaceNode) => void
  onCloseWindow: (id: string) => void
}) {
  const { t } = useTranslation()

  if (item.builtinKey === 'settings') {
    return <OsSettingsWindowContent />
  }

  if (item.builtinKey === 'shadow-cloud') {
    return (
      <div className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-bg-base">
        <Suspense fallback={<OsEmbeddedLoadingPane />}>
          <CloudSaasApp embedded initialPath="/" />
        </Suspense>
      </div>
    )
  }

  if (item.builtinKey === 'cloud-computers') {
    return <CloudComputersPage embedded />
  }

  if (item.builtinKey === 'discover') {
    return (
      <div className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-bg-base">
        <DiscoverPage embedded initialView="browse" />
      </div>
    )
  }

  if (item.builtinKey === 'my-buddies') {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-bg-base p-3">
        <MyBuddySettingsContent embedded />
      </div>
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
      <WorkspacePage
        serverId={serverSlug}
        embedded
        collapsibleSidebar
        hideFooter
        initialNodeId={item.workspaceNode?.id}
        initialPath={item.workspaceNode?.path}
        onOpenFile={onOpenWorkspaceFile}
        onPinFileToDesktop={onPinWorkspaceFile}
      />
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
        />
      </div>
    )
  }

  return null
}
