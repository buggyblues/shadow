import type { OAuthLinkCard } from '@shadowob/shared'
import { DecorativeImage, TooltipAnchor, TooltipIconButton, cn } from '@shadowob/ui'
import { ChevronRight, ExternalLink, Globe2, X } from 'lucide-react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/ui.store'

export interface OAuthLinkPreview {
  card: OAuthLinkCard
  messageId: string
  channelId?: string
}

interface OAuthLinkCardViewProps {
  card: OAuthLinkCard
  messageId: string
  channelId?: string
  onPreview: (preview: OAuthLinkPreview) => void
}

interface OAuthLinkPreviewPanelProps {
  preview: OAuthLinkPreview
  onClose: () => void
  presentation?: 'inline' | 'overlay'
}

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function formatOrigin(value: string) {
  const url = parseUrl(value)
  return url ? url.host : value
}

function getCardAvatarUrl(card: OAuthLinkCard) {
  return card.meta?.avatarUrl ?? card.meta?.iconUrl ?? card.iconUrl ?? null
}

function getCardAppName(card: OAuthLinkCard) {
  return card.meta?.appName ?? card.title
}

export function OAuthLinkCardView({
  card,
  messageId,
  channelId,
  onPreview,
}: OAuthLinkCardViewProps) {
  const { t } = useTranslation()
  const avatarUrl = getCardAvatarUrl(card)
  const appName = getCardAppName(card)
  const origin = card.meta?.origin ?? formatOrigin(card.url)

  return (
    <button
      type="button"
      aria-label={t('chat.oauthLinkPreviewAria', { title: card.title })}
      onClick={() => onPreview({ card, messageId, channelId })}
      className="group block max-w-[480px] overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary/80 text-left shadow-sm transition hover:border-primary/45 hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      {card.meta?.coverUrl && (
        <DecorativeImage
          src={card.meta.coverUrl}
          className="h-16 w-full object-cover"
          loading="lazy"
        />
      )}
      <div className="flex items-center gap-3 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-bg-primary text-text-muted">
          {avatarUrl ? (
            <DecorativeImage
              src={avatarUrl}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <Globe2 size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-text-muted">
            <Globe2 size={12} />
            <span>{t('chat.oauthLinkCardLabel')}</span>
            {appName && <span className="min-w-0 truncate normal-case">· {appName}</span>}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-text-primary">{card.title}</div>
          {card.description && (
            <div className="mt-1 line-clamp-2 text-xs text-text-secondary">{card.description}</div>
          )}
          <div className="mt-1 truncate text-xs text-text-muted">{origin}</div>
        </div>
        <ChevronRight
          size={18}
          className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-text-primary"
          aria-hidden="true"
        />
      </div>
    </button>
  )
}

export function OAuthLinkPreviewPanel({
  preview,
  onClose,
  presentation = 'inline',
}: OAuthLinkPreviewPanelProps) {
  const { t } = useTranslation()
  const { card, messageId, channelId } = preview
  const [isConnected, setIsConnected] = useState(false)
  const [panelWidth, setPanelWidth] = useState(640)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )
  const [isResizing, setIsResizing] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(640)
  const setFilePreviewOpen = useUIStore((s) => s.setFilePreviewOpen)

  const frameUrl = card.embedUrl ?? card.url
  const fallbackUrl = card.fallbackUrl ?? card.url
  const frameOrigin = useMemo(() => parseUrl(frameUrl)?.origin ?? null, [frameUrl])
  const avatarUrl = getCardAvatarUrl(card)
  const appName = getCardAppName(card)

  const handleDragStart = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault()
      isDragging.current = true
      setIsResizing(true)
      dragStartX.current = event.clientX
      dragStartWidth.current = panelWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return
        const delta = dragStartX.current - moveEvent.clientX
        const maxWidth = Math.max(320, Math.min(window.innerWidth - 24, window.innerWidth * 0.72))
        setPanelWidth(Math.max(320, Math.min(maxWidth, dragStartWidth.current + delta)))
      }

      const handleMouseUp = () => {
        isDragging.current = false
        setIsResizing(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [panelWidth],
  )

  useEffect(() => {
    setFilePreviewOpen(true)
    return () => setFilePreviewOpen(false)
  }, [setFilePreviewOpen])

  useEffect(() => {
    setIsConnected(false)
  }, [card.id, frameUrl])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (frameOrigin && event.origin !== frameOrigin) return
      if (event.data?.type !== 'shadow.card.ready') return
      setIsConnected(true)
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'shadow.card.launch',
          card: {
            id: card.id,
            appId: card.appId,
            clientId: card.clientId ?? null,
            scopes: card.scopes ?? [],
          },
          context: {
            messageId,
            channelId: channelId ?? null,
          },
        },
        frameOrigin ?? '*',
      )
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [card.appId, card.clientId, card.id, card.scopes, channelId, frameOrigin, messageId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const panelBaseClasses =
    'flex flex-col overflow-hidden border border-border-subtle bg-bg-secondary/88 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl'
  const shouldUseSheet = presentation === 'overlay' || viewportWidth < 1440
  const isNarrowSheet = shouldUseSheet && viewportWidth < 720
  const maxInlineWidth = Math.min(680, Math.max(420, viewportWidth - 1040))
  const inlineWidth = Math.max(420, Math.min(panelWidth, maxInlineWidth))
  const sheetWidth = Math.min(panelWidth, Math.max(320, viewportWidth - 24))
  const panelClasses = shouldUseSheet
    ? `${isNarrowSheet ? 'fixed inset-2' : 'fixed inset-y-3 right-3'} z-40 rounded-3xl animate-slide-in-right ${panelBaseClasses}`
    : `relative mr-3 ml-2 h-full shrink-0 rounded-3xl animate-slide-in-right ${panelBaseClasses}`
  const panelStyle = isNarrowSheet
    ? undefined
    : { width: shouldUseSheet ? sheetWidth : inlineWidth }

  return (
    <>
      {shouldUseSheet && (
        <button
          type="button"
          aria-label={t('common.close')}
          className="fixed inset-0 z-30 bg-bg-deep/35 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}
      <aside className={panelClasses} style={panelStyle} aria-label={card.title}>
        {isResizing && <div className="absolute inset-0 z-20" />}
        <div
          className="absolute bottom-0 left-0 top-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/40"
          onMouseDown={handleDragStart}
        >
          <div className="absolute inset-y-0 -left-1 w-3" />
        </div>

        <div className="m-1.5 mb-0 flex min-h-12 shrink-0 items-center gap-2.5 rounded-[20px] border border-border-subtle/70 bg-bg-primary/45 px-3 py-1.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-bg-primary text-text-muted">
            {avatarUrl ? (
              <DecorativeImage
                src={avatarUrl}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <Globe2 size={17} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{card.title}</p>
            <p
              className={cn(
                'truncate text-[11px]',
                isConnected ? 'text-green-500' : 'text-text-muted',
              )}
            >
              {appName} · {isConnected ? t('chat.oauthLinkConnected') : t('chat.oauthLinkWaiting')}
            </p>
          </div>
          <TooltipAnchor label={t('chat.oauthLinkOpenExternal')}>
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-1.5 text-text-muted transition hover:bg-bg-modifier-hover hover:text-text-primary"
              aria-label={t('chat.oauthLinkOpenExternal')}
            >
              <ExternalLink size={16} />
            </a>
          </TooltipAnchor>
          <TooltipIconButton
            label={t('common.close')}
            onClick={onClose}
            size="xs"
            className="!h-auto !w-auto !rounded-md !p-1.5 !font-normal !normal-case !tracking-normal text-text-muted transition hover:bg-bg-modifier-hover hover:text-text-primary"
          >
            <X size={16} />
          </TooltipIconButton>
        </div>

        <div className="min-h-0 flex-1 p-1.5">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-border-subtle/70 bg-bg-primary/45">
            <iframe
              ref={iframeRef}
              src={frameUrl}
              title={t('chat.oauthLinkFrameTitle', { title: card.title })}
              className="min-h-0 flex-1 border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        <div className="border-t border-border-subtle px-4 py-2 text-xs text-text-muted">
          {t('chat.oauthLinkFallback')}
        </div>
      </aside>
    </>
  )
}
