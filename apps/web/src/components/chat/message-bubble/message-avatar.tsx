import { Button } from '@shadowob/ui'
import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import type { MouseEvent, RefObject } from 'react'
import { memo, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { UserAvatar } from '../../common/avatar'
import { useConfirmStore } from '../../common/confirm-dialog'
import { UserProfileCard } from '../../common/user-profile-card'
import type { Author, BuddyAgentEntry, MemberEntry, Message } from './types'

interface AvatarCardPosition {
  left: number
  top: number
}

interface AvatarContextMenuPosition {
  x: number
  y: number
}

export function useMessageAvatarState(author?: Author) {
  const avatarRef = useRef<HTMLDivElement>(null)
  const [avatarHover, setAvatarHover] = useState(false)
  const [avatarPinned, setAvatarPinned] = useState(false)
  const [avatarCardPos, setAvatarCardPos] = useState<AvatarCardPosition | null>(null)
  const [avatarContextMenu, setAvatarContextMenu] = useState<AvatarContextMenuPosition | null>(null)
  const avatarHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const positionAvatarCard = useCallback(() => {
    if (!avatarRef.current) return
    const rect = avatarRef.current.getBoundingClientRect()
    setAvatarCardPos({
      left: rect.right + 12,
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
    })
  }, [])

  const handleAvatarMouseEnter = useCallback(() => {
    if (avatarPinned) return
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
    avatarHoverTimerRef.current = setTimeout(() => {
      positionAvatarCard()
      setAvatarHover(true)
    }, 350)
  }, [avatarPinned, positionAvatarCard])

  const handleAvatarMouseLeave = useCallback(() => {
    if (avatarPinned) return
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
    avatarHoverTimerRef.current = setTimeout(() => setAvatarHover(false), 200)
  }, [avatarPinned])

  const handleAvatarClick = useCallback(() => {
    if (!author) return
    setAvatarPinned(true)
    setAvatarHover(true)
    positionAvatarCard()
  }, [author, positionAvatarCard])

  const handleAvatarContextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault()
    setAvatarContextMenu({ x: event.clientX, y: event.clientY })
  }, [])

  const closeAvatarCard = useCallback(() => {
    setAvatarPinned(false)
    setAvatarHover(false)
  }, [])

  const clearAvatarHoverTimer = useCallback(() => {
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
  }, [])

  return {
    avatarCardPos,
    avatarContextMenu,
    avatarHover,
    avatarPinned,
    avatarRef,
    clearAvatarHoverTimer,
    closeAvatarCard,
    handleAvatarClick,
    handleAvatarContextMenu,
    handleAvatarMouseEnter,
    handleAvatarMouseLeave,
    setAvatarContextMenu,
  }
}

interface MessageAvatarButtonProps {
  author?: Author
  avatarRef: RefObject<HTMLDivElement | null>
  onClick: () => void
  onContextMenu: (event: MouseEvent) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  replyToMessage?: Message | null
}

function MessageAvatarButtonBase({
  author,
  avatarRef,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  replyToMessage,
}: MessageAvatarButtonProps) {
  return (
    <div
      ref={avatarRef}
      className={`flex-shrink-0 ${replyToMessage ? 'mt-6' : 'mt-0.5'} cursor-pointer`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <UserAvatar
        userId={author?.id}
        avatarUrl={author?.avatarUrl}
        displayName={author?.displayName ?? author?.username}
        size="md"
      />
    </div>
  )
}

interface MessageAvatarPortalsProps {
  author?: Author
  authorMember?: MemberEntry
  avatarCardPos: AvatarCardPosition | null
  avatarContextMenu: AvatarContextMenuPosition | null
  avatarHover: boolean
  avatarPinned: boolean
  buddyAgent?: BuddyAgentEntry
  canKick: boolean
  clearAvatarHoverTimer: () => void
  closeAvatarCard: () => void
  currentUserId: string
  handleAvatarClick: () => void
  handleAvatarMouseLeave: () => void
  queryClient: QueryClient
  serverId?: string
  setAvatarContextMenu: (value: AvatarContextMenuPosition | null) => void
}

function MessageAvatarPortalsBase({
  author,
  authorMember,
  avatarCardPos,
  avatarContextMenu,
  avatarHover,
  avatarPinned,
  buddyAgent,
  canKick,
  clearAvatarHoverTimer,
  closeAvatarCard,
  currentUserId,
  handleAvatarClick,
  handleAvatarMouseLeave,
  queryClient,
  serverId,
  setAvatarContextMenu,
}: MessageAvatarPortalsProps) {
  const { t } = useTranslation()
  const profileRole = (authorMember?.role as 'owner' | 'admin' | 'member') ?? null
  const ownerName = buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username
  const description =
    typeof buddyAgent?.config?.description === 'string' ? buddyAgent.config.description : undefined

  return (
    <>
      {avatarHover &&
        !avatarPinned &&
        author &&
        avatarCardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: avatarCardPos.left, top: avatarCardPos.top }}
            onMouseEnter={clearAvatarHoverTimer}
            onMouseLeave={handleAvatarMouseLeave}
          >
            <UserProfileCard
              user={author}
              role={profileRole}
              ownerName={ownerName}
              description={description}
            />
          </div>,
          document.body,
        )}

      {avatarPinned &&
        avatarHover &&
        author &&
        createPortal(
          <div
            className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
            onClick={closeAvatarCard}
          >
            <div onClick={(event) => event.stopPropagation()}>
              <UserProfileCard
                user={author}
                role={profileRole}
                ownerName={ownerName}
                description={description}
              />
            </div>
          </div>,
          document.body,
        )}

      {avatarContextMenu &&
        createPortal(
          <AvatarContextMenu
            author={author}
            authorMember={authorMember}
            canKick={canKick}
            currentUserId={currentUserId}
            handleAvatarClick={handleAvatarClick}
            position={avatarContextMenu}
            queryClient={queryClient}
            serverId={serverId}
            setAvatarContextMenu={setAvatarContextMenu}
            t={t}
          />,
          document.body,
        )}
    </>
  )
}

interface AvatarContextMenuProps {
  author?: Author
  authorMember?: MemberEntry
  canKick: boolean
  currentUserId: string
  handleAvatarClick: () => void
  position: AvatarContextMenuPosition
  queryClient: QueryClient
  serverId?: string
  setAvatarContextMenu: (value: AvatarContextMenuPosition | null) => void
  t: TFunction
}

function AvatarContextMenu({
  author,
  authorMember,
  canKick,
  currentUserId,
  handleAvatarClick,
  position,
  queryClient,
  serverId,
  setAvatarContextMenu,
  t,
}: AvatarContextMenuProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={() => setAvatarContextMenu(null)}
        onContextMenu={(event) => {
          event.preventDefault()
          setAvatarContextMenu(null)
        }}
      />
      <div
        className="fixed z-[61] bg-bg-primary/95 backdrop-blur-xl rounded-[24px] border border-border-subtle shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1.5 min-w-[160px]"
        style={{ left: position.x, top: position.y }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAvatarContextMenu(null)
            handleAvatarClick()
          }}
          className="!w-full !justify-start !rounded-none !font-normal !normal-case !tracking-normal !px-3 !py-2 !text-sm !h-auto text-text-secondary hover:text-text-primary"
        >
          {t('member.viewProfile')}
        </Button>
        {canKick && author?.id !== currentUserId && authorMember?.role !== 'owner' && (
          <>
            <div className="h-px bg-border-subtle my-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const name = author?.displayName ?? author?.username
                const confirmKey = author?.isBot
                  ? 'member.removeBuddyConfirm'
                  : 'member.kickConfirm'
                const titleKey = author?.isBot ? 'member.removeBuddy' : 'member.kickMember'
                const ok = await useConfirmStore.getState().confirm({
                  title: t(titleKey),
                  message: t(confirmKey, { name }),
                })
                if (ok && serverId) {
                  fetchApi(`/api/servers/${serverId}/members/${author?.id}`, {
                    method: 'DELETE',
                  }).then(() => {
                    queryClient.invalidateQueries({
                      queryKey: ['members', serverId],
                    })
                  })
                }
                setAvatarContextMenu(null)
              }}
              className="!w-full !justify-start !rounded-none !font-normal !normal-case !tracking-normal !px-3 !py-2 !text-sm !h-auto text-danger hover:!bg-danger/10"
            >
              {author?.isBot ? t('member.removeBuddy') : t('member.kickMember')}
            </Button>
          </>
        )}
      </div>
    </>
  )
}

export const MessageAvatarButton = memo(MessageAvatarButtonBase)
export const MessageAvatarPortals = memo(MessageAvatarPortalsBase)

MessageAvatarButton.displayName = 'MessageAvatarButton'
MessageAvatarPortals.displayName = 'MessageAvatarPortals'
