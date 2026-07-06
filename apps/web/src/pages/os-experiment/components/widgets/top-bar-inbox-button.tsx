import { EyeOff, Loader2, Pin } from 'lucide-react'
import { type MutableRefObject, memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, type ContextMenuGroup } from '../../../../components/common/context-menu'
import { PresenceAvatar } from '../../../../components/common/presence-avatar'
import { OsInboxHoverCard } from '../../channel-ui'
import type { BuddyInboxEntry } from '../../types'
import { buddyDisplayName } from '../../utils'

type OsTopBarInboxButtonProps = {
  entry: BuddyInboxEntry
  unread: number
  active: boolean
  pinnedToDesktop: boolean
  loading: boolean
  floatingPreviewLayerZIndex: number
  floatingLayerZIndex: number
  inboxButtonRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  isPreviewSuppressed: () => boolean
  onOpen: (entry: BuddyInboxEntry, anchor: DOMRect) => void
  onPinToDesktop?: (entry: BuddyInboxEntry) => void
  onUnpinFromDesktop?: (entry: BuddyInboxEntry) => void
}

export const OsTopBarInboxButton = memo(function OsTopBarInboxButton({
  entry,
  unread,
  active,
  pinnedToDesktop,
  loading,
  floatingPreviewLayerZIndex,
  floatingLayerZIndex,
  inboxButtonRefs,
  isPreviewSuppressed,
  onOpen,
  onPinToDesktop,
  onUnpinFromDesktop,
}: OsTopBarInboxButtonProps) {
  const { t } = useTranslation()
  const [previewVisible, setPreviewVisible] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const label = buddyDisplayName(entry)
  const canToggleDesktopPin = pinnedToDesktop
    ? Boolean(onUnpinFromDesktop)
    : Boolean(onPinToDesktop)
  const contextMenuGroups = useMemo<ContextMenuGroup[]>(
    () =>
      canToggleDesktopPin
        ? [
            {
              items: [
                {
                  icon: pinnedToDesktop ? EyeOff : Pin,
                  label: t(pinnedToDesktop ? 'os.unpinBuddyFromDesktop' : 'os.pinBuddyToDesktop'),
                  onClick: () => {
                    if (pinnedToDesktop) {
                      onUnpinFromDesktop?.(entry)
                      return
                    }
                    onPinToDesktop?.(entry)
                  },
                },
              ],
            },
          ]
        : [],
    [canToggleDesktopPin, entry, onPinToDesktop, onUnpinFromDesktop, pinnedToDesktop, t],
  )

  return (
    <>
      <button
        type="button"
        ref={(node) => {
          if (node) {
            inboxButtonRefs.current.set(entry.agent.id, node)
          } else {
            inboxButtonRefs.current.delete(entry.agent.id)
          }
        }}
        className={[
          'group/inbox relative grid h-8 w-8 shrink-0 place-items-center overflow-visible rounded-full text-white transition hover:bg-white/8 hover:scale-[1.03] disabled:opacity-45',
          active ? 'hover:bg-transparent' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={label}
        aria-label={`${t('os.openInbox')}: ${label}`}
        data-os-floating-bubble-trigger="true"
        onPointerEnter={() => setPreviewVisible(!isPreviewSuppressed())}
        onPointerLeave={() => setPreviewVisible(false)}
        onFocus={() => setPreviewVisible(!isPreviewSuppressed())}
        onBlur={() => setPreviewVisible(false)}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          if (!canToggleDesktopPin) return
          event.preventDefault()
          event.stopPropagation()
          setPreviewVisible(false)
          setContextMenu({ x: event.clientX, y: event.clientY })
        }}
        onClick={(event) => {
          event.stopPropagation()
          setPreviewVisible(false)
          onOpen(entry, event.currentTarget.getBoundingClientRect())
        }}
      >
        {loading ? (
          <Loader2 size={15} className="animate-spin text-white/72" />
        ) : (
          <PresenceAvatar
            userId={entry.agent.user.id}
            avatarUrl={entry.agent.user.avatarUrl}
            displayName={label}
            status={entry.agent.user.status}
            agentStatus={entry.agent.status}
            lastHeartbeat={entry.agent.lastHeartbeat}
            isBot
            size="xs"
            className={
              active
                ? 'rounded-full ring-2 ring-primary ring-offset-2 ring-offset-black/45'
                : undefined
            }
          />
        )}
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-black/40" />
        ) : null}
        {previewVisible && !isPreviewSuppressed() ? (
          <div
            className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-[810] opacity-0 transition duration-150 group-hover/inbox:opacity-100 group-focus-visible/inbox:opacity-100"
            style={{ zIndex: floatingPreviewLayerZIndex }}
          >
            <OsInboxHoverCard entry={entry} unread={unread} />
          </div>
        ) : null}
      </button>
      {contextMenu && contextMenuGroups.length > 0 ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          groups={contextMenuGroups}
          onClose={() => setContextMenu(null)}
          zIndex={floatingLayerZIndex}
        />
      ) : null}
    </>
  )
}, areOsTopBarInboxButtonPropsEqual)

function areOsTopBarInboxButtonPropsEqual(
  prev: OsTopBarInboxButtonProps,
  next: OsTopBarInboxButtonProps,
) {
  return (
    prev.entry.agent.id === next.entry.agent.id &&
    prev.entry.agent.status === next.entry.agent.status &&
    prev.entry.agent.lastHeartbeat === next.entry.agent.lastHeartbeat &&
    prev.entry.agent.user.id === next.entry.agent.user.id &&
    prev.entry.agent.user.username === next.entry.agent.user.username &&
    prev.entry.agent.user.displayName === next.entry.agent.user.displayName &&
    prev.entry.agent.user.avatarUrl === next.entry.agent.user.avatarUrl &&
    prev.entry.agent.user.status === next.entry.agent.user.status &&
    prev.entry.channel?.id === next.entry.channel?.id &&
    prev.entry.channel?.name === next.entry.channel?.name &&
    prev.entry.channel?.type === next.entry.channel?.type &&
    prev.entry.channel?.topic === next.entry.channel?.topic &&
    prev.entry.canManage === next.entry.canManage &&
    prev.unread === next.unread &&
    prev.active === next.active &&
    prev.pinnedToDesktop === next.pinnedToDesktop &&
    prev.loading === next.loading &&
    prev.floatingPreviewLayerZIndex === next.floatingPreviewLayerZIndex &&
    prev.floatingLayerZIndex === next.floatingLayerZIndex &&
    prev.inboxButtonRefs === next.inboxButtonRefs &&
    prev.isPreviewSuppressed === next.isPreviewSuppressed &&
    prev.onOpen === next.onOpen &&
    prev.onPinToDesktop === next.onPinToDesktop &&
    prev.onUnpinFromDesktop === next.onUnpinFromDesktop
  )
}
