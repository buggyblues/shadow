import { useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from './avatar'
import { OnlineRank } from './online-rank'
import { UserProfileCard } from './user-profile-card'

export interface BuddyListItemData {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  isBot: boolean
  role?: 'owner' | 'admin' | 'member'
  nickname?: string | null
  // Buddy-specific fields
  ownerId?: string
  ownerName?: string
  ownerAvatarUrl?: string | null
  description?: string
  totalOnlineSeconds?: number
}

interface BuddyListItemProps {
  buddy: BuddyListItemData
  /** Whether to show hover card on mouse enter (web only) */
  showHoverCard?: boolean
  /** Whether the item is clickable to navigate to profile */
  clickable?: boolean
  /** Additional CSS classes */
  className?: string
  /** Child elements to render on the right side */
  rightElement?: React.ReactNode
  /** Callback when item is clicked */
  onClick?: (buddy: BuddyListItemData) => void
  /** Whether to show the Buddy badge */
  showBotBadge?: boolean
  /** Whether to show the role badge */
  showRoleBadge?: boolean
  /** Whether to show online rank for bots */
  showOnlineRank?: boolean
  /** Custom element to show instead of default layout */
  children?: React.ReactNode
}

const statusColors: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
}

/**
 * Unified Buddy List Item Component
 *
 * Displays avatar, nickname/username, slug, online status, and level.
 * - Web: Hover to show profile card, click to navigate to profile
 * - Supports custom rightElement for actions (select buttons, etc.)
 */
export function BuddyListItem({
  buddy,
  showHoverCard = true,
  clickable = true,
  className = '',
  rightElement,
  onClick,
  showBotBadge = true,
  showRoleBadge = true,
  showOnlineRank = true,
  children,
}: BuddyListItemProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const itemRef = useRef<HTMLButtonElement>(null)

  // Hover card state
  const [isHovered, setIsHovered] = useState(false)
  const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const displayName = buddy.nickname ?? buddy.displayName

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(buddy)
    } else if (clickable) {
      navigate({ to: '/app/profile/$userId', params: { userId: buddy.userId } })
    }
  }, [buddy, clickable, navigate, onClick])

  const handleMouseEnter = useCallback(() => {
    if (!showHoverCard) return
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      if (itemRef.current) {
        setHoverAnchorRect(itemRef.current.getBoundingClientRect())
        setIsHovered(true)
      }
    }, 400)
  }, [showHoverCard])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 200)
  }, [])

  const roleBadge =
    showRoleBadge && buddy.role && buddy.role !== 'member'
      ? {
          label: t(`member.${buddy.role}`),
          color:
            buddy.role === 'owner'
              ? 'text-yellow-400'
              : buddy.role === 'admin'
                ? 'text-blue-400'
                : 'text-text-muted',
        }
      : null

  if (children) {
    return (
      <div className={className} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        {children}
        {isHovered && hoverAnchorRect && (
          <BuddyHoverCard
            buddy={buddy}
            anchorRect={hoverAnchorRect}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
            }}
            onMouseLeave={handleMouseLeave}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <button
        ref={itemRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex items-center gap-3 px-2 py-1.5 w-full rounded-md hover:bg-bg-modifier-hover transition group text-left ${className}`}
      >
        {/* Avatar with status dot */}
        <div className="relative shrink-0">
          <UserAvatar
            userId={buddy.userId}
            avatarUrl={buddy.avatarUrl}
            displayName={displayName}
            size="sm"
          />
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-bg-secondary ${statusColors[buddy.status]}`}
            title={t(`member.${buddy.status}`)}
          />
        </div>

        {/* Name and info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span
              className={`text-[15px] truncate font-medium ${buddy.status === 'offline' ? 'text-text-muted' : 'text-text-secondary group-hover:text-text-primary'} transition`}
            >
              {displayName}
            </span>
            {buddy.isBot && showBotBadge && (
              <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded-[3px] font-semibold flex items-center gap-1 shrink-0">
                <Check size={8} className="text-white" />
                Buddy
              </span>
            )}
          </div>
          {roleBadge && <span className={`text-[10px] ${roleBadge.color}`}>{roleBadge.label}</span>}
          {buddy.isBot &&
            showOnlineRank &&
            buddy.totalOnlineSeconds != null &&
            buddy.totalOnlineSeconds > 0 && <OnlineRank totalSeconds={buddy.totalOnlineSeconds} />}
        </div>

        {/* Right element (actions, select button, etc.) */}
        {rightElement && <div className="shrink-0">{rightElement}</div>}
      </button>

      {/* Hover card portal */}
      {isHovered && hoverAnchorRect && (
        <BuddyHoverCard
          buddy={buddy}
          anchorRect={hoverAnchorRect}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
          }}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </>
  )
}

/**
 * Hover card for BuddyListItem
 */
function BuddyHoverCard({
  buddy,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  buddy: BuddyListItemData
  anchorRect: DOMRect
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  // Calculate position to avoid screen edges
  const cardWidth = 256 // w-64
  const cardHeight = 320 // approximate max height
  const spacing = 12

  let left = anchorRect.left - cardWidth - spacing
  let top = anchorRect.top

  // If would overflow left edge, show on right
  if (left < spacing) {
    left = anchorRect.right + spacing
  }

  // If would overflow right edge, show on left
  if (left + cardWidth > window.innerWidth - spacing) {
    left = anchorRect.left - cardWidth - spacing
  }

  // Adjust vertical position to stay on screen
  if (top + cardHeight > window.innerHeight - spacing) {
    top = Math.max(spacing, window.innerHeight - cardHeight - spacing)
  }

  return createPortal(
    <div
      className="fixed z-[80]"
      style={{ left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <UserProfileCard
        user={{
          id: buddy.userId,
          username: buddy.username,
          displayName: buddy.displayName,
          avatarUrl: buddy.avatarUrl,
          status: buddy.status,
          isBot: buddy.isBot,
        }}
        role={buddy.role}
        ownerName={buddy.ownerName}
        ownerId={buddy.ownerId}
        ownerAvatarUrl={buddy.ownerAvatarUrl}
        description={buddy.description}
        totalOnlineSeconds={buddy.totalOnlineSeconds}
      />
    </div>,
    document.body,
  )
}

/**
 * Buddy List Item Skeleton for loading states
 */
export function BuddyListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 w-full">
      {/* Avatar skeleton */}
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-full bg-bg-tertiary animate-pulse" />
        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-bg-secondary bg-bg-tertiary animate-pulse" />
      </div>

      {/* Text skeleton */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="h-4 w-24 bg-bg-tertiary rounded animate-pulse" />
        <div className="h-3 w-16 bg-bg-tertiary rounded animate-pulse" />
      </div>
    </div>
  )
}

/**
 * Convert Member data to BuddyListItemData
 */
export function memberToBuddyItem(
  member: {
    id: string
    userId: string
    role?: 'owner' | 'admin' | 'member'
    nickname?: string | null
    user?: {
      id: string
      username: string
      displayName: string
      avatarUrl: string | null
      status: 'online' | 'idle' | 'dnd' | 'offline'
      isBot: boolean
    } | null
  },
  buddyMeta?: {
    ownerId?: string
    ownerName?: string
    ownerAvatarUrl?: string | null
    description?: string
    totalOnlineSeconds?: number
  },
): BuddyListItemData | null {
  if (!member.user) return null

  return {
    id: member.id,
    userId: member.userId,
    username: member.user.username,
    displayName: member.user.displayName,
    avatarUrl: member.user.avatarUrl,
    status: member.user.status,
    isBot: member.user.isBot,
    role: member.role,
    nickname: member.nickname,
    ownerId: buddyMeta?.ownerId,
    ownerName: buddyMeta?.ownerName,
    ownerAvatarUrl: buddyMeta?.ownerAvatarUrl,
    description: buddyMeta?.description,
    totalOnlineSeconds: buddyMeta?.totalOnlineSeconds,
  }
}

/**
 * Convert Agent data to BuddyListItemData
 */
export function agentToBuddyItem(agent: {
  id: string
  userId: string
  status: string
  totalOnlineSeconds?: number
  config?: { description?: string }
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  owner?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}): BuddyListItemData | null {
  if (!agent.botUser) return null

  return {
    id: agent.id,
    userId: agent.userId,
    username: agent.botUser.username,
    displayName: agent.botUser.displayName || agent.botUser.username,
    avatarUrl: agent.botUser.avatarUrl,
    status: agent.status === 'running' ? 'online' : 'offline',
    isBot: true,
    role: 'member',
    ownerId: agent.owner?.id,
    ownerName: agent.owner?.displayName || agent.owner?.username,
    ownerAvatarUrl: agent.owner?.avatarUrl,
    description: agent.config?.description,
    totalOnlineSeconds: agent.totalOnlineSeconds,
  }
}
