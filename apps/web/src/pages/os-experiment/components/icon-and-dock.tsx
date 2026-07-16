import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBuddyInboxSummary,
} from '@shadowob/sdk/bridge'
import { cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { AppWindow, FileText, Hash, Inbox, Loader2, MonitorUp } from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  forwardRef,
  memo,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../components/chat/message-bubble/types'
import { fetchApi } from '../../../lib/api'
import { ChannelView } from '../../channel-view'
import { OsBuiltinAppIcon } from '../builtin-icons'
import type { LaunchContext, OsWindowState, SpaceAppInstallation } from '../types'
import {
  clampWindowPosition,
  clampWindowResize,
  DESKTOP_EDGE_PADDING,
  DOCK_RESERVED_HEIGHT,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  OS_GC_MS,
  OS_SNAP_DWELL_MS,
  OS_TOP_BAR_HEIGHT,
  snapWindowToPointer,
  withLaunchParams,
} from '../utils'

export const AppIcon = memo(function AppIcon({
  iconUrl,
  className,
}: {
  iconUrl?: string | null
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const shouldLoadIcon = Boolean(iconUrl && !failed)

  useEffect(() => setFailed(false), [iconUrl])

  if (!shouldLoadIcon) {
    return (
      <span
        className={cn(
          'grid h-full w-full place-items-center rounded-[inherit] text-current',
          className,
        )}
      >
        <AppWindow size={22} />
      </span>
    )
  }

  return (
    <img
      src={iconUrl ?? ''}
      alt=""
      draggable={false}
      className={cn('h-full w-full object-cover', className)}
      onError={() => setFailed(true)}
    />
  )
})

export type OsDockButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  active?: boolean
  icon: ReactNode
  label: string
  badge?: number
  surface?: 'tile' | 'bare'
  wrapIcon?: boolean
}

export const OsDockButton = memo(
  forwardRef<HTMLButtonElement, OsDockButtonProps>(function OsDockButton(
    {
      active,
      icon,
      label,
      badge,
      onClick,
      onMouseDown,
      surface = 'tile',
      wrapIcon = true,
      className,
      type = 'button',
      ...props
    },
    ref,
  ) {
    const bare = surface === 'bare'

    return (
      <button
        ref={ref}
        type={type}
        onClick={onClick}
        onMouseDown={onMouseDown}
        aria-label={label}
        className={cn(
          'pointer-events-auto group relative grid h-11 w-11 shrink-0 select-none place-items-center rounded-2xl text-white/86 transition duration-150 hover:-translate-y-1 hover:scale-[1.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
          active && 'drop-shadow-[0_12px_24px_rgba(0,198,209,0.34)]',
          className,
        )}
        {...props}
      >
        <span className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 max-w-48 -translate-x-1/2 select-none whitespace-nowrap rounded-lg border border-white/12 bg-bg-secondary/95 px-2.5 py-1.5 text-xs font-black text-text-primary opacity-0 shadow-[0_14px_40px_rgba(0,0,0,0.36)] backdrop-blur-xl transition duration-150 group-hover:translate-y-[-2px] group-hover:opacity-100 group-focus-visible:opacity-100">
          {label}
        </span>
        {wrapIcon && !bare ? (
          <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-[14px] text-current [&>img]:h-full [&>img]:w-full [&>svg]:h-5 [&>svg]:w-5">
            {icon}
          </span>
        ) : (
          icon
        )}
        {active && <span className="absolute -bottom-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
        {badge ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border border-primary/55 bg-primary px-1 text-[10px] font-black text-bg-deep shadow-[0_8px_18px_rgba(0,198,209,0.28)]">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </button>
    )
  }),
)
OsDockButton.displayName = 'OsDockButton'

export const OsDockSeparator = memo(function OsDockSeparator({ visible }: { visible: boolean }) {
  if (!visible) return null
  return <span className="mx-0.5 h-7 w-px shrink-0 self-center bg-white/16" />
})

export function OsWindowTitleIcon({
  item,
  className,
}: {
  item: OsWindowState
  className?: string
}) {
  if (item.kind === 'app') {
    return <AppIcon iconUrl={item.iconUrl} className={cn('h-7 w-7 shrink-0', className)} />
  }
  if (item.kind === 'voice-screen') {
    return <MonitorUp size={16} className={cn('shrink-0 text-text-muted', className)} />
  }
  if (item.kind === 'inbox') {
    return <Inbox size={16} className={cn('shrink-0 text-text-muted', className)} />
  }
  if (item.kind === 'chat-file') {
    return <FileText size={16} className={cn('shrink-0 text-text-muted', className)} />
  }
  if (item.kind === 'workspace-file') {
    return <FileText size={16} className={cn('shrink-0 text-text-muted', className)} />
  }
  if (item.kind === 'builtin') {
    return (
      <OsBuiltinAppIcon appKey={item.builtinKey} className={cn('h-7 w-7 shrink-0', className)} />
    )
  }
  return <Hash size={16} className={cn('shrink-0 text-text-muted', className)} />
}
