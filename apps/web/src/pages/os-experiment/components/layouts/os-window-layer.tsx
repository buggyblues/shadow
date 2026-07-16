import type { Attachment } from '../../../../components/chat/message-bubble/types'
import type { AuthenticatedUser } from '../../../../lib/auth-session'
import type { WorkspaceNode } from '../../../../stores/workspace.store'
import type { OsWindowState, ServerEntry, SpaceAppInstallation } from '../../types'
import { OsBuiltinWindowContent, OsFileWindowContent } from '../../window-content'
import type { OsBridgeBuddyCreatorLanding, OsBridgeBuddyCreatorResult } from '../bridge-utils'
import { OsVoiceScreenShareWindow } from '../voice-screen-share-window'
import { OsWindowFrame } from '../window-frame'
import type { ResizeMode, WindowRect } from '../window-geometry'

type OsWindowLayerProps = {
  windows: OsWindowState[]
  focusedWindowId: string | null
  maximizedWindowId: string | null
  serverSlug: string
  selectedServer: ServerEntry
  user: AuthenticatedUser | null | undefined
  apps: SpaceAppInstallation[]
  appByKey: Map<string, SpaceAppInstallation>
  isAppsLoading: boolean
  windowEdgeClassById: Map<string, string>
  builtinWindowContentRevision: unknown
  canPinWorkspaceFiles: boolean
  onCloseWindow: (id: string) => void
  onFocusWindow: (id: string) => void
  onMinimizeWindow: (id: string) => void
  onToggleMaximizeWindow: (id: string) => void
  onRestoreWindowForDrag: (id: string, rect: WindowRect) => void
  onMoveWindow: (id: string, rect: WindowRect) => void
  onResizeWindow: (
    id: string,
    rect: { x: number; y: number; width: number; height: number },
    mode: ResizeMode,
    phase: 'preview' | 'commit',
  ) => void
  onPreviewFile?: (attachment: Attachment) => void
  onAppRouteChange?: (id: string, path: string) => void
  onOpenChannel?: (input: { channelId: string; messageId?: string }) => Promise<boolean>
  onOpenInbox?: (input: { agentId?: string; channelId?: string }) => Promise<boolean>
  onOpenBuddyCreator?: (input: {
    landing?: OsBridgeBuddyCreatorLanding
  }) => Promise<OsBridgeBuddyCreatorResult>
  onOpenWorkspaceResource?: (input: {
    workspaceFileId?: string
    workspaceNodeId?: string
  }) => Promise<boolean>
  onOpenApp: (app: SpaceAppInstallation) => void
  onOpenWorkspaceFile: (node: WorkspaceNode) => void
  onPinWorkspaceFile: (node: WorkspaceNode) => void
}

export function OsWindowLayer({
  windows,
  focusedWindowId,
  maximizedWindowId,
  serverSlug,
  selectedServer,
  user,
  apps,
  appByKey,
  isAppsLoading,
  windowEdgeClassById,
  builtinWindowContentRevision,
  canPinWorkspaceFiles,
  onCloseWindow,
  onFocusWindow,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onRestoreWindowForDrag,
  onMoveWindow,
  onResizeWindow,
  onPreviewFile,
  onAppRouteChange,
  onOpenChannel,
  onOpenInbox,
  onOpenBuddyCreator,
  onOpenWorkspaceResource,
  onOpenApp,
  onOpenWorkspaceFile,
  onPinWorkspaceFile,
}: OsWindowLayerProps) {
  return (
    <>
      {windows.map((item) => (
        <OsWindowFrame
          key={item.id}
          item={item}
          focused={focusedWindowId === item.id}
          showMaximizedTab={maximizedWindowId === item.id}
          serverSlug={serverSlug}
          app={item.appKey ? (appByKey.get(item.appKey) ?? null) : null}
          edgeClassName={windowEdgeClassById.get(item.id) ?? ''}
          contentRevision={item.kind === 'builtin' ? builtinWindowContentRevision : undefined}
          onClose={onCloseWindow}
          onFocus={onFocusWindow}
          onMinimize={onMinimizeWindow}
          onToggleMaximize={onToggleMaximizeWindow}
          onRestoreForDrag={onRestoreWindowForDrag}
          onMove={onMoveWindow}
          onResize={onResizeWindow}
          onPreviewFile={onPreviewFile}
          onAppRouteChange={onAppRouteChange}
          onOpenChannel={onOpenChannel}
          onOpenInbox={onOpenInbox}
          onOpenBuddyCreator={onOpenBuddyCreator}
          onOpenWorkspaceResource={onOpenWorkspaceResource}
          siblingWindows={windows}
        >
          {item.kind === 'voice-screen' ? (
            <OsVoiceScreenShareWindow channelId={item.channelId} />
          ) : item.kind === 'builtin' ? (
            <OsBuiltinWindowContent
              item={item}
              serverSlug={serverSlug}
              selectedServer={selectedServer}
              user={user}
              apps={apps}
              isAppsLoading={isAppsLoading}
              onOpenApp={onOpenApp}
              onOpenWorkspaceFile={onOpenWorkspaceFile}
              onPinWorkspaceFile={canPinWorkspaceFiles ? onPinWorkspaceFile : undefined}
              onCloseWindow={onCloseWindow}
            />
          ) : item.kind === 'workspace-file' || item.kind === 'chat-file' ? (
            <OsFileWindowContent
              item={item}
              serverSlug={serverSlug}
              onCloseWindow={onCloseWindow}
            />
          ) : null}
        </OsWindowFrame>
      ))}
    </>
  )
}
