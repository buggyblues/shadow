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
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
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

const MOVEMENT_RANGE = 24
const MOVEMENT_EASING = 0.08
const BACKGROUND_SCALE = 1.03

export const OsBackground = memo(function OsBackground({
  serverWallpaper,
}: {
  serverWallpaper?: {
    type: 'image' | 'html'
    url: string
    serverId?: string | null
    workspaceFileId?: string | null
    interactive?: boolean
  } | null
}) {
  const { t } = useTranslation()
  const backgroundImage = useUIStore((state) => state.backgroundImage)
  const enableBackgroundMovement = useUIStore((state) => state.enableBackgroundMovement)
  const prefersReducedMotion = useReducedMotion()
  const disableBackgroundMotion = false
  const layerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const currentRef = useRef({ x: 0, y: 0 })
  const targetRef = useRef({ x: 0, y: 0 })
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const wallpaper = serverWallpaper?.url
    ? serverWallpaper
    : backgroundImage
      ? ({ type: 'image', url: backgroundImage, interactive: false } as const)
      : null
  const shouldMove = Boolean(
    wallpaper?.url &&
      !wallpaper.interactive &&
      enableBackgroundMovement &&
      !prefersReducedMotion &&
      !disableBackgroundMotion,
  )
  const imageWallpaperUrl = wallpaper?.type === 'image' ? resolvedImageUrl : null

  useEffect(() => {
    if (!wallpaper || wallpaper.type !== 'image') {
      setResolvedImageUrl(null)
      setImageLoaded(false)
      return
    }

    let cancelled = false
    setResolvedImageUrl(null)
    setImageLoaded(false)

    if (serverWallpaper?.serverId && serverWallpaper.workspaceFileId) {
      fetchApi<{ url: string }>(
        `/api/servers/${serverWallpaper.serverId}/workspace/files/${serverWallpaper.workspaceFileId}/media-url?disposition=inline`,
      )
        .then((result) => {
          if (!cancelled) setResolvedImageUrl(result.url)
        })
        .catch(() => {
          if (!cancelled) setResolvedImageUrl(wallpaper.url)
        })
    } else {
      setResolvedImageUrl(wallpaper.url)
    }

    return () => {
      cancelled = true
    }
  }, [serverWallpaper?.serverId, serverWallpaper?.workspaceFileId, wallpaper?.type, wallpaper?.url])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const applyTransform = (x: number, y: number) => {
      layer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${BACKGROUND_SCALE})`
    }

    const cancelAnimation = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }

    const resetPosition = () => {
      cancelAnimation()
      currentRef.current = { x: 0, y: 0 }
      targetRef.current = { x: 0, y: 0 }
      applyTransform(0, 0)
    }

    if (!shouldMove) {
      resetPosition()
      return
    }

    const tick = () => {
      const current = currentRef.current
      const target = targetRef.current
      const nextX = current.x + (target.x - current.x) * MOVEMENT_EASING
      const nextY = current.y + (target.y - current.y) * MOVEMENT_EASING

      currentRef.current = { x: nextX, y: nextY }
      applyTransform(nextX, nextY)

      if (Math.abs(target.x - nextX) < 0.1 && Math.abs(target.y - nextY) < 0.1) {
        frameRef.current = null
        return
      }

      frameRef.current = requestAnimationFrame(tick)
    }

    const handleMouseMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * -MOVEMENT_RANGE * 2
      const y = (event.clientY / window.innerHeight - 0.5) * -MOVEMENT_RANGE * 2

      targetRef.current = { x, y }

      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      resetPosition()
    }
  }, [shouldMove, wallpaper?.url])

  return (
    <>
      {wallpaper ? (
        wallpaper.type === 'html' ? (
          shouldMove ? (
            <div
              ref={layerRef}
              aria-hidden="true"
              className="absolute inset-[-24px] will-change-transform"
              style={{
                transform: `translate3d(0, 0, 0) scale(${BACKGROUND_SCALE})`,
                backfaceVisibility: 'hidden',
              }}
            >
              <OsHtmlWallpaperFrame
                title={t('os.serverWallpaper')}
                src={wallpaper.url}
                className="absolute inset-0 h-full w-full border-0 bg-black pointer-events-none"
              />
            </div>
          ) : (
            <OsHtmlWallpaperFrame
              title={t('os.serverWallpaper')}
              src={wallpaper.url}
              contextMenuBridge={Boolean(wallpaper.interactive)}
              pointerBridge={Boolean(wallpaper.interactive)}
              className={cn(
                'absolute inset-0 h-full w-full border-0 bg-black',
                !wallpaper.interactive && 'pointer-events-none',
              )}
            />
          )
        ) : (
          <div
            ref={layerRef}
            aria-hidden="true"
            className={cn(
              'overflow-hidden bg-[linear-gradient(135deg,#07111b_0%,#19303a_44%,#10221d_100%)]',
              shouldMove ? 'absolute inset-[-24px] will-change-transform' : 'absolute inset-0',
            )}
            style={{
              transform: shouldMove ? `translate3d(0, 0, 0) scale(${BACKGROUND_SCALE})` : 'none',
              backfaceVisibility: shouldMove ? 'hidden' : undefined,
            }}
          >
            {imageWallpaperUrl ? (
              <img
                src={imageWallpaperUrl}
                alt=""
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
                  imageLoaded ? 'opacity-100' : 'opacity-0',
                )}
                decoding="async"
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  if (imageWallpaperUrl !== wallpaper.url) {
                    setResolvedImageUrl(wallpaper.url)
                    return
                  }
                  setImageLoaded(false)
                }}
              />
            ) : null}
            {!imageLoaded ? (
              <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#07111b_0%,#19303a_44%,#10221d_100%)] text-white/48">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : null}
          </div>
        )
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,#07111b_0%,#19303a_44%,#10221d_100%)]"
        />
      )}
      {!wallpaper ? (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,0.16),transparent_34%),radial-gradient(circle_at_86%_18%,rgba(0,198,209,0.12),transparent_30%)]" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.36))]" />
        </>
      ) : null}
    </>
  )
})
