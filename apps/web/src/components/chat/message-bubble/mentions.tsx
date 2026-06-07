import type { MessageMention } from '@shadowob/shared'
import { Button, cn } from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import { AppWindow, AtSign, Copy, ExternalLink, Hash, Lock } from 'lucide-react'
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { copyToClipboard } from '../../../lib/clipboard'
import { useAuthStore } from '../../../stores/auth.store'
import { useChatStore } from '../../../stores/chat.store'
import { useConfirmStore } from '../../common/confirm-dialog'
import { UserProfileCard } from '../../common/user-profile-card'
import type { BuddyAgentEntry, MemberEntry } from './types'

/* ── MentionSpan — @username with hover card ──────────────── */

type EntityPopoverPosition = {
  left: number
  top: number
  placement: 'top' | 'bottom'
  arrowLeft: number
}

const ENTITY_MENTION_POPOVER_WIDTH = 320
const ENTITY_MENTION_POPOVER_HEIGHT = 178
const ENTITY_MENTION_POPOVER_GAP = 12
const ENTITY_MENTION_POPOVER_MARGIN = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function prefixedEntityLabel(prefix: '@' | '#', value: string) {
  const trimmed = value.trim()
  if (!trimmed) return prefix
  return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`
}

export function EntityMentionSpan({ mention }: { mention: MessageMention }) {
  const { t } = useTranslation()
  const [showCard, setShowCard] = useState(false)
  const [cardPos, setCardPos] = useState<EntityPopoverPosition | null>(null)
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spanRef = useRef<HTMLButtonElement>(null)

  const isUnknownPrivateChannel =
    mention.kind === 'channel' && mention.isPrivate === true && !mention.channelId

  const targetPath = useMemo(() => {
    if (mention.kind === 'channel' && mention.channelId && mention.serverId) {
      const serverSegment = mention.serverSlug || mention.serverId
      return `/app/servers/${serverSegment}/channels/${mention.channelId}`
    }
    if (mention.kind === 'app' && mention.appKey && mention.serverId) {
      const serverSegment = mention.serverSlug || mention.serverId
      return `/app/servers/${serverSegment}/apps/${mention.appKey}`
    }
    if (mention.kind === 'server' && mention.serverId) {
      const serverSegment = mention.serverSlug || mention.serverId
      return `/app/servers/${serverSegment}`
    }
    return null
  }, [mention])

  const navigate = useCallback(() => {
    if (!targetPath) return
    window.location.href = targetPath
  }, [targetPath])

  const computeCardPos = useCallback(() => {
    if (!spanRef.current) return
    const rect = spanRef.current.getBoundingClientRect()
    const triggerCenter = rect.left + rect.width / 2
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxLeft = Math.max(
      ENTITY_MENTION_POPOVER_MARGIN,
      viewportWidth - ENTITY_MENTION_POPOVER_WIDTH - ENTITY_MENTION_POPOVER_MARGIN,
    )
    const left = clamp(
      triggerCenter - ENTITY_MENTION_POPOVER_WIDTH / 2,
      ENTITY_MENTION_POPOVER_MARGIN,
      maxLeft,
    )
    const availableTop = rect.top - ENTITY_MENTION_POPOVER_GAP - ENTITY_MENTION_POPOVER_MARGIN
    const availableBottom =
      viewportHeight - rect.bottom - ENTITY_MENTION_POPOVER_GAP - ENTITY_MENTION_POPOVER_MARGIN
    const placement =
      availableTop >= ENTITY_MENTION_POPOVER_HEIGHT || availableTop > availableBottom
        ? 'top'
        : 'bottom'
    const desiredTop =
      placement === 'top'
        ? rect.top - ENTITY_MENTION_POPOVER_HEIGHT - ENTITY_MENTION_POPOVER_GAP
        : rect.bottom + ENTITY_MENTION_POPOVER_GAP
    const maxTop = Math.max(
      ENTITY_MENTION_POPOVER_MARGIN,
      viewportHeight - ENTITY_MENTION_POPOVER_HEIGHT - ENTITY_MENTION_POPOVER_MARGIN,
    )
    setCardPos({
      left,
      top: clamp(desiredTop, ENTITY_MENTION_POPOVER_MARGIN, maxTop),
      placement,
      arrowLeft: clamp(triggerCenter - left, 24, ENTITY_MENTION_POPOVER_WIDTH - 24),
    })
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      computeCardPos()
      setShowCard(true)
    }, 250)
  }, [computeCardPos])

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setShowCard(false), 180)
  }, [])

  useEffect(() => {
    if (!showCard) return
    const updatePosition = () => computeCardPos()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [computeCardPos, showCard])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const copyTargetLink = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!targetPath) return
      const absoluteUrl = new URL(targetPath, window.location.origin).toString()
      const didCopy = await copyToClipboard(absoluteUrl, {
        successMessage: t('common.copied'),
        errorMessage: t('chat.copyFailed'),
      })
      if (!didCopy) return
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1200)
    },
    [t, targetPath],
  )

  const channelName =
    mention.channelName ??
    mention.label?.replace(/^#/, '') ??
    mention.sourceToken?.replace(/^#/, '') ??
    mention.token
  const serverName =
    mention.serverName ??
    mention.label?.replace(/^@/, '') ??
    mention.sourceToken?.replace(/^@/, '') ??
    mention.token
  const appName =
    mention.appName ??
    mention.label?.replace(/^@/, '') ??
    mention.sourceToken?.replace(/^@/, '') ??
    mention.appKey ??
    mention.token
  const displayLabel = isUnknownPrivateChannel
    ? prefixedEntityLabel('#', t('channel.privateChannel'))
    : mention.label || mention.sourceToken || mention.token
  const title = isUnknownPrivateChannel
    ? prefixedEntityLabel('#', t('channel.privateChannel'))
    : mention.kind === 'channel'
      ? prefixedEntityLabel('#', channelName)
      : mention.kind === 'app'
        ? prefixedEntityLabel('@', appName)
        : prefixedEntityLabel('@', serverName)
  const subtitle =
    mention.kind === 'channel'
      ? (mention.serverName ?? '')
      : mention.kind === 'app'
        ? (mention.appKey ?? mention.serverName ?? '')
        : (mention.serverSlug ?? mention.serverId ?? '')
  const openLabel =
    mention.kind === 'channel'
      ? t('channel.openChannel')
      : mention.kind === 'app'
        ? t('serverApps.openApp')
        : t('server.openServer')
  const copyLabel =
    mention.kind === 'channel'
      ? t('channel.copyChannelLink')
      : mention.kind === 'app'
        ? t('serverApps.copyAppLink')
        : t('server.copyServerLink')

  const icon =
    mention.kind === 'channel' ? (
      isUnknownPrivateChannel || mention.isPrivate ? (
        <Lock size={22} strokeWidth={2.4} />
      ) : (
        <Hash size={24} strokeWidth={2.6} />
      )
    ) : mention.kind === 'app' ? (
      mention.iconUrl ? (
        <img src={mention.iconUrl} alt="" className="h-6 w-6 rounded-md object-cover" />
      ) : (
        <AppWindow size={24} strokeWidth={2.4} />
      )
    ) : (
      <AtSign size={24} strokeWidth={2.6} />
    )

  return (
    <>
      <button
        ref={spanRef}
        type="button"
        className={cn(
          'relative inline-flex items-center align-baseline rounded-[6px] bg-primary/15 px-1 text-primary transition hover:bg-primary/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70',
          targetPath ? 'cursor-pointer' : 'cursor-help',
        )}
        onClick={navigate}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
      >
        {displayLabel}
      </button>
      {showCard &&
        cardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: cardPos.left, top: cardPos.top }}
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
            }}
            onMouseLeave={handleMouseLeave}
          >
            <div
              role="dialog"
              className="relative w-[320px] rounded-lg border border-white/10 bg-[#111722]/95 p-3 text-left shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl"
            >
              <div
                className={cn(
                  'absolute h-3 w-3 rotate-45 border-white/10 bg-[#111722]/95',
                  cardPos.placement === 'top'
                    ? '-bottom-1.5 border-b border-r'
                    : '-top-1.5 border-l border-t',
                )}
                style={{ left: cardPos.arrowLeft - 6 }}
              />
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  {icon}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-text-primary">{title}</div>
                  {subtitle && <div className="truncate text-sm text-text-muted">{subtitle}</div>}
                </div>
              </div>
              {mention.kind === 'channel' && mention.isPrivate && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-text-muted">
                  <Lock size={12} />
                  <span>{t('channel.privateChannel')}</span>
                </div>
              )}
              {targetPath && (
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 flex-1 cursor-pointer rounded-md bg-white/10 text-text-primary hover:bg-white/15"
                    onClick={navigate}
                  >
                    <ExternalLink size={14} />
                    <span>{openLabel}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 flex-1 cursor-pointer rounded-md border border-white/10 text-text-secondary hover:bg-white/10 hover:text-text-primary"
                    onClick={copyTargetLink}
                  >
                    <Copy size={14} />
                    <span>{copied ? t('common.copied') : copyLabel}</span>
                  </Button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export function MentionSpan({
  mention,
  label,
  structuredMention,
}: {
  mention: string
  label?: string
  structuredMention?: MessageMention
}) {
  const { t } = useTranslation()
  const [showCard, setShowCard] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spanRef = useRef<HTMLSpanElement>(null)
  const activeServerId = useChatStore((state) => state.activeServerId)
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const username =
    structuredMention?.username ??
    (mention.startsWith('@') ? mention.slice(1) : structuredMention?.sourceToken?.slice(1))
  const userId = structuredMention?.userId ?? structuredMention?.targetId

  // Look up user from cached members query
  const members = queryClient.getQueryData<MemberEntry[]>(['members', activeServerId]) ?? []
  const member = members.find(
    (m) =>
      m.user?.id === userId || m.user?.username === username || m.user?.displayName === username,
  )
  const user =
    member?.user ??
    (userId
      ? {
          id: userId,
          username: structuredMention?.username ?? username ?? userId,
          displayName:
            structuredMention?.displayName ?? structuredMention?.username ?? username ?? userId,
          avatarUrl: structuredMention?.avatarUrl ?? null,
          status: 'offline',
          isBot: structuredMention?.isBot ?? structuredMention?.kind === 'buddy',
        }
      : undefined)

  // Buddy metadata
  const buddyAgentsList =
    queryClient.getQueryData<BuddyAgentEntry[]>(['members-buddy-agents', activeServerId]) ?? []
  const buddyAgent = user?.isBot
    ? buddyAgentsList.find((a: BuddyAgentEntry) => a.botUser?.id === user.id)
    : undefined

  // Current user's role for kick/remove ability
  const currentMember = members.find((m: MemberEntry) => m.userId === currentUser?.id)
  const canKick = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  const computeCardPos = () => {
    if (!spanRef.current) return
    const rect = spanRef.current.getBoundingClientRect()
    setCardPos({
      left: rect.left,
      top: Math.max(8, rect.top - 280),
    })
  }

  const handleMouseEnter = () => {
    if (pinned) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      computeCardPos()
      setShowCard(true)
    }, 300)
  }

  const handleMouseLeave = () => {
    if (pinned) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setShowCard(false), 200)
  }

  const handleClick = () => {
    if (user) {
      setPinned(true)
      setShowCard(true)
      computeCardPos()
    }
  }

  const handleClose = () => {
    setPinned(false)
    setShowCard(false)
  }

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <span
        ref={spanRef}
        className="relative inline-block bg-primary/20 text-primary rounded px-1 cursor-pointer hover:bg-primary/30 transition"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {label ?? mention}
      </span>

      {/* Hover card (portal to body to avoid clipping) */}
      {showCard &&
        !pinned &&
        user &&
        cardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: cardPos.left, top: cardPos.top }}
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
            }}
            onMouseLeave={handleMouseLeave}
          >
            <UserProfileCard
              user={user}
              role={(member?.role as 'owner' | 'admin' | 'member') ?? null}
              ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
              description={
                typeof buddyAgent?.config?.description === 'string'
                  ? buddyAgent.config.description
                  : undefined
              }
            />
          </div>,
          document.body,
        )}

      {/* Pinned profile card as a centered overlay */}
      {pinned &&
        showCard &&
        user &&
        createPortal(
          <div
            className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
            onClick={handleClose}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <UserProfileCard
                user={user}
                role={(member?.role as 'owner' | 'admin' | 'member') ?? null}
                ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
                description={
                  typeof buddyAgent?.config?.description === 'string'
                    ? buddyAgent.config.description
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Right-click context menu */}
      {ctxMenu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setCtxMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu(null)
              }}
            />
            <div
              className="fixed z-[61] bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 px-1.5"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCtxMenu(null)
                  handleClick()
                }}
                className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                {t('member.viewProfile')}
              </Button>
              {canKick && user?.id !== currentUser?.id && member?.role !== 'owner' && (
                <>
                  <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1 shrink-0" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const name = user?.displayName ?? user?.username
                      const confirmKey = user?.isBot
                        ? 'member.removeBuddyConfirm'
                        : 'member.kickConfirm'
                      const titleKey = user?.isBot ? 'member.removeBuddy' : 'member.kickMember'
                      const ok = await useConfirmStore.getState().confirm({
                        title: t(titleKey),
                        message: t(confirmKey, { name }),
                      })
                      if (ok) {
                        fetchApi(`/api/servers/${activeServerId}/members/${user?.id}`, {
                          method: 'DELETE',
                        }).then(() => {
                          queryClient.invalidateQueries({
                            queryKey: ['members', activeServerId],
                          })
                        })
                      }
                      setCtxMenu(null)
                    }}
                    className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-danger hover:!bg-danger/10 hover:text-danger transition-colors group"
                  >
                    {user?.isBot ? t('member.removeBuddy') : t('member.kickMember')}
                  </Button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
