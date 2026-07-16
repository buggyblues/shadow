import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
} from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  ImageIcon,
  Keyboard,
  Loader2,
  Maximize2,
  MessageSquare,
  Play,
  Plus,
  RotateCw,
  StickyNote,
  Trash2,
  Upload,
  Video,
  X,
  Youtube,
} from 'lucide-react'
import { marked } from 'marked'
import {
  type CSSProperties,
  type DragEvent,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { MessageInput } from '../../../components/chat/message-input'
import { ContextMenu, type ContextMenuGroup } from '../../../components/common/context-menu'
import { getFileTypeVisual } from '../../../components/common/file-type-visual'
import { PresenceAvatar } from '../../../components/common/presence-avatar'
import {
  buildWorkspaceContextMenuGroups,
  workspaceContextMenuLabels,
} from '../../../components/workspace/WorkspaceContextMenu'
import {
  type PickerResult,
  WorkspaceFilePicker,
} from '../../../components/workspace/WorkspaceFilePicker'
import { fetchApi } from '../../../lib/api'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { OsBuiltinAppIcon } from '../builtin-icons'
import { ChannelTypeIcon } from '../channel-ui'
import { AppIcon } from '../components'
import { OsHtmlWallpaperFrame } from '../html-wallpaper-frame'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsBuiltinAppKey,
  OsChatInputWidgetMode,
  OsDesktopChatInputWidget,
  OsDesktopItem,
  OsDesktopPhotoWidget,
  OsDesktopTypewriterWidget,
  OsDesktopVideoWidget,
  OsDesktopWebEmbedWidget,
  OsDesktopWidget,
  OsDesktopWorkspaceItem,
  OsPhotoWidgetSourceType,
  OsStickyNoteMentionContext,
  OsStickyNoteMentionTarget,
  OsTypewriterWidgetFontFamily,
  OsTypewriterWidgetTextShadow,
  OsVideoWidgetProvider,
  OsWebEmbedWidgetSourceType,
} from '../types'
import { buddyDisplayName, OS_TOP_BAR_HEIGHT, OS_WORKSPACE_NODE_DRAG_TYPE } from '../utils'
import { DESKTOP_ICON_SURFACE_CLASS, DESKTOP_ICON_TEXT_SHADOW } from './geometry'

const DESKTOP_BARE_ICON_CLASS =
  'grid h-14 w-14 place-items-center text-white/90 drop-shadow-[0_12px_24px_rgba(0,0,0,0.30)]'

function desktopItemIconSignature(item: OsDesktopItem) {
  if (item.kind === 'workspace-node') {
    return [
      item.kind,
      item.node.kind,
      item.node.mime ?? '',
      item.node.name,
      item.node.ext ?? '',
    ].join(':')
  }
  if (item.kind === 'space-app') {
    return [item.kind, item.appKey, item.iconUrl ?? ''].join(':')
  }
  if (item.kind === 'buddy-inbox') {
    return [
      item.kind,
      item.inbox.agent.id,
      item.inbox.agent.status ?? '',
      item.inbox.agent.lastHeartbeat ?? '',
      item.inbox.agent.user.id,
      item.inbox.agent.user.avatarUrl ?? '',
      item.inbox.agent.user.displayName ?? '',
      item.inbox.agent.user.username,
      item.inbox.agent.user.status ?? '',
      item.inbox.channel?.id ?? '',
    ].join(':')
  }
  if (item.kind === 'channel') {
    return [item.kind, item.channel.id, item.channel.name, item.channel.type ?? ''].join(':')
  }
  return [item.kind, item.builtinKey].join(':')
}

export const DesktopItemIcon = memo(
  function DesktopItemIcon({ item }: { item: OsDesktopItem }) {
    if (item.kind === 'workspace-node') {
      const visual = getFileTypeVisual(item.node.mime, item.node.name)
      const Icon = item.node.kind === 'dir' ? Folder : (visual.icon ?? FileText)
      return (
        <span
          className={cn(
            DESKTOP_ICON_SURFACE_CLASS,
            item.node.kind === 'dir' ? 'bg-cyan-400/18 text-cyan-200' : visual.bg,
          )}
        >
          <Icon size={24} className={item.node.kind === 'dir' ? undefined : visual.color} />
        </span>
      )
    }

    if (item.kind === 'space-app') {
      return (
        <span className={DESKTOP_BARE_ICON_CLASS}>
          <AppIcon iconUrl={item.iconUrl} className="h-14 w-14 rounded-[16px]" />
        </span>
      )
    }

    if (item.kind === 'buddy-inbox') {
      const label = buddyDisplayName(item.inbox)
      return (
        <PresenceAvatar
          userId={item.inbox.agent.user.id}
          avatarUrl={item.inbox.agent.user.avatarUrl}
          displayName={label}
          status={item.inbox.agent.user.status}
          agentStatus={item.inbox.agent.status}
          lastHeartbeat={item.inbox.agent.lastHeartbeat}
          isBot
          size="lg"
          className={cn(DESKTOP_BARE_ICON_CLASS, '[&>img]:h-14 [&>img]:w-14')}
          loading="eager"
        />
      )
    }

    if (item.kind === 'channel') {
      return (
        <span className={cn(DESKTOP_BARE_ICON_CLASS, 'text-cyan-100')}>
          <ChannelTypeIcon type={item.channel.type} size={30} />
        </span>
      )
    }

    return (
      <span className={DESKTOP_BARE_ICON_CLASS}>
        <OsBuiltinAppIcon appKey={item.builtinKey} className="rounded-[16px]" />
      </span>
    )
  },
  (previous, next) =>
    desktopItemIconSignature(previous.item) === desktopItemIconSignature(next.item),
)

export function desktopItemLabel(item: OsDesktopItem) {
  if (item.kind === 'workspace-node') return item.node.name
  if (item.kind === 'buddy-inbox') return buddyDisplayName(item.inbox)
  if (item.kind === 'channel') return item.channel.name
  return item.title
}
