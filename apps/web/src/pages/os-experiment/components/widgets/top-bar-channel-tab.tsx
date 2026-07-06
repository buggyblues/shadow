import { cn } from '@shadowob/ui'
import { X } from 'lucide-react'
import { type MutableRefObject, memo, type MouseEvent as ReactMouseEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChannelTypeIcon, OsChannelTabHoverCard } from '../../channel-ui'
import type { OsChannelTab } from '../../types'

function channelDisplayName(title: string) {
  return title.replace(/^#+/u, '')
}

type OsTopBarChannelTabProps = {
  tab: OsChannelTab
  unread: number
  draggingTabId: string | null
  floatingPreviewLayerZIndex: number
  tabRefs: MutableRefObject<Map<string, HTMLDivElement>>
  isPreviewSuppressed: () => boolean
  onDraggingTabChange: (id: string | null) => void
  onClose: (tab: OsChannelTab) => void
  onContextMenu: (tab: OsChannelTab, event: ReactMouseEvent<HTMLDivElement>) => void
  onOpen: (tab: OsChannelTab, anchor: DOMRect) => void
  onReorder: (sourceId: string, targetId: string) => void
}

export const OsTopBarChannelTab = memo(function OsTopBarChannelTab({
  tab,
  unread,
  draggingTabId,
  floatingPreviewLayerZIndex,
  tabRefs,
  isPreviewSuppressed,
  onDraggingTabChange,
  onClose,
  onContextMenu,
  onOpen,
  onReorder,
}: OsTopBarChannelTabProps) {
  const { t } = useTranslation()
  const [previewVisible, setPreviewVisible] = useState(false)
  const displayTitle = channelDisplayName(tab.title)

  return (
    <div
      ref={(node) => {
        if (node) {
          tabRefs.current.set(tab.id, node)
        } else {
          tabRefs.current.delete(tab.id)
        }
      }}
      role="tab"
      tabIndex={0}
      aria-selected={tab.active}
      draggable
      className={cn(
        'group/tab relative flex h-8 min-w-0 max-w-40 cursor-default select-none items-center gap-1 rounded-lg py-0 pl-2 pr-4 text-left text-xs font-black transition',
        tab.active
          ? 'bg-white/10 text-white shadow-[0_6px_16px_rgba(0,0,0,0.12)]'
          : 'text-white/62 hover:bg-white/7 hover:text-white',
        draggingTabId === tab.id && 'opacity-55',
      )}
      title={displayTitle}
      aria-label={displayTitle}
      data-os-floating-bubble-trigger="true"
      onPointerEnter={() => setPreviewVisible(!isPreviewSuppressed())}
      onPointerLeave={() => setPreviewVisible(false)}
      onFocus={() => setPreviewVisible(!isPreviewSuppressed())}
      onBlur={() => setPreviewVisible(false)}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault()
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return
        event.preventDefault()
        event.stopPropagation()
        onClose(tab)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setPreviewVisible(false)
        onContextMenu(tab, event)
      }}
      onDragStart={(event) => {
        onDraggingTabChange(tab.id)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', tab.id)
      }}
      onDragEnd={() => onDraggingTabChange(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const sourceId = event.dataTransfer.getData('text/plain') || draggingTabId
        onDraggingTabChange(null)
        if (!sourceId || sourceId === tab.id) return
        onReorder(sourceId, tab.id)
      }}
      onClick={(event) => {
        event.stopPropagation()
        setPreviewVisible(false)
        onOpen(tab, event.currentTarget.getBoundingClientRect())
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        setPreviewVisible(false)
        onOpen(tab, event.currentTarget.getBoundingClientRect())
      }}
    >
      <span className="shrink-0 text-white/62 group-hover/tab:text-white/82">
        <ChannelTypeIcon type={tab.type} size={14} />
      </span>
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-black/45" />
      ) : null}
      <span className="block min-w-0 flex-1 truncate">{displayTitle}</span>
      <button
        type="button"
        tabIndex={-1}
        className={cn(
          'pointer-events-none absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-white text-black/72 opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.22)] transition hover:text-black group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100',
        )}
        aria-label={t('os.closeWindow')}
        onClick={(event) => {
          event.stopPropagation()
          onClose(tab)
        }}
      >
        <X size={11} />
      </button>
      {previewVisible && !isPreviewSuppressed() ? (
        <div
          className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-[810] -translate-x-1/2 opacity-0 transition duration-150 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
          style={{ zIndex: floatingPreviewLayerZIndex }}
        >
          <OsChannelTabHoverCard
            channel={{
              id: tab.channelId,
              name: displayTitle,
              type: tab.type,
              topic: tab.topic,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}, areOsTopBarChannelTabPropsEqual)

function areOsTopBarChannelTabPropsEqual(
  prev: OsTopBarChannelTabProps,
  next: OsTopBarChannelTabProps,
) {
  return (
    prev.tab.id === next.tab.id &&
    prev.tab.channelId === next.tab.channelId &&
    prev.tab.title === next.tab.title &&
    prev.tab.type === next.tab.type &&
    prev.tab.topic === next.tab.topic &&
    prev.tab.active === next.tab.active &&
    prev.unread === next.unread &&
    prev.draggingTabId === next.draggingTabId &&
    prev.floatingPreviewLayerZIndex === next.floatingPreviewLayerZIndex &&
    prev.tabRefs === next.tabRefs &&
    prev.isPreviewSuppressed === next.isPreviewSuppressed &&
    prev.onDraggingTabChange === next.onDraggingTabChange &&
    prev.onClose === next.onClose &&
    prev.onContextMenu === next.onContextMenu &&
    prev.onOpen === next.onOpen &&
    prev.onReorder === next.onReorder
  )
}
