import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Lock,
  LogOut,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Settings,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../components/chat/message-bubble/types'
import { PresenceAvatar } from '../../../components/common/presence-avatar'
import { MemberList } from '../../../components/member/member-list'
import { NotificationBell } from '../../../components/notification/notification-bell'
import { ServerIcon } from '../../../components/server/server-icon'
import { fetchApi } from '../../../lib/api'
import type { AuthenticatedUser } from '../../../lib/auth-session'
import { showToast } from '../../../lib/toast'
import { useUIStore } from '../../../stores/ui.store'
import { ChannelView } from '../../channel-view'
import {
  CHANNEL_CREATE_TYPES,
  type ChannelCreateType,
  ChannelTypeIcon,
  OsChannelTabHoverCard,
  OsInboxHoverCard,
} from '../channel-ui'
import { OsHtmlWallpaperFrame } from '../html-wallpaper-frame'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsChannelTab,
  ScopedUnread,
  ServerEntry,
} from '../types'
import { buddyDisplayName, OS_GC_MS, OS_STALE_MS, OS_TOP_BAR_HEIGHT } from '../utils'

const BUBBLE_EDGE_PADDING = 12
const BUBBLE_ARROW_CENTER_PADDING = 22
export const OS_FLOATING_BUBBLE_INTERACTIVE_SELECTOR = [
  '[data-os-floating-bubble-root="true"]',
  '[data-os-floating-bubble-trigger="true"]',
  '[data-os-floating-bubble-portal="true"]',
  '[role="dialog"][aria-modal="true"]',
].join(',')

export type BubblePosition = {
  arrowCenterX: number
  left: number
  top: number
  width: number
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function resolveBubblePosition(
  anchor: DOMRect | undefined,
  requestedWidth: number,
  fallbackCenterX: number,
): BubblePosition | null {
  if (typeof window === 'undefined') return null

  const width = Math.min(requestedWidth, window.innerWidth - BUBBLE_EDGE_PADDING * 2)
  const triggerCenterX = anchor
    ? anchor.left + anchor.width / 2
    : clampNumber(fallbackCenterX, BUBBLE_EDGE_PADDING, window.innerWidth - BUBBLE_EDGE_PADDING)
  const left = clampNumber(
    triggerCenterX - width / 2,
    BUBBLE_EDGE_PADDING,
    window.innerWidth - width - BUBBLE_EDGE_PADDING,
  )
  const arrowCenterX = clampNumber(
    triggerCenterX - left,
    BUBBLE_ARROW_CENTER_PADDING,
    width - BUBBLE_ARROW_CENTER_PADDING,
  )

  return {
    arrowCenterX,
    left,
    top: (anchor?.bottom ?? OS_TOP_BAR_HEIGHT) + 12,
    width,
  }
}

export function BubbleArrow({ centerX }: { centerX: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-2 h-4 w-4 -translate-x-1/2 rotate-45 rounded-[3px] border-l border-t border-white/16 bg-bg-primary/96 shadow-[-8px_-8px_22px_rgba(0,0,0,0.22)]"
      style={{ left: centerX }}
    />
  )
}

export function OsFloatingBubbleSurface({
  position,
  zIndex,
  className,
  contentClassName,
  children,
}: {
  position: BubblePosition
  zIndex: number
  className?: string
  contentClassName?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'fixed z-[820] isolate overflow-visible rounded-[24px] border border-white/16 bg-bg-primary/96 shadow-[0_28px_100px_rgba(0,0,0,0.48),0_10px_32px_rgba(0,0,0,0.2)] backdrop-blur-2xl',
        className,
      )}
      data-os-floating-bubble-root="true"
      style={{
        zIndex,
        left: position.left,
        top: position.top,
        width: position.width,
      }}
    >
      <BubbleArrow centerX={position.arrowCenterX} />
      <div
        className={cn(
          'relative z-10 h-full w-full overflow-hidden rounded-[23px] [transform:translateZ(0)]',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
