import { cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import {
  AppWindow,
  Cloud,
  Compass,
  FileText,
  Folder,
  Hash,
  Inbox,
  Loader2,
  PawPrint,
  Settings,
  ShoppingBag,
  Store,
  User,
} from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../components/chat/message-bubble/types'
import { fetchApi } from '../../lib/api'
import { ChannelView } from '../channel-view'
import type { LaunchContext, OsBuiltinAppKey, OsWindowState, ServerAppIntegration } from './types'
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
} from './utils'

export type ResizeMode =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

type WindowRect = Pick<OsWindowState, 'x' | 'y' | 'width' | 'height'>
type DockStackKey = 'apps' | 'files' | 'minimized'

export function osBuiltinIconToneClassName(key: OsBuiltinAppKey | null | undefined) {
  if (key === 'workspace') return 'text-cyan-200'
  if (key === 'discover') return 'text-emerald-200'
  if (key === 'app-store') return 'text-violet-200'
  if (key === 'shop') return 'text-amber-200'
  if (key === 'settings' || key === 'server-settings') return 'text-lime-200'
  if (key === 'shadow-cloud') return 'text-sky-200'
  if (key === 'my-buddies') return 'text-fuchsia-200'
  return 'text-text-muted'
}

function rectChanged(left: WindowRect | null, right: WindowRect | null) {
  if (!left || !right) return left !== right
  return (
    left.x !== right.x ||
    left.y !== right.y ||
    left.width !== right.width ||
    left.height !== right.height
  )
}

function rectsOverlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(startA, startB) < Math.min(endA, endB)
}

function rectKey(rect: WindowRect | null) {
  return rect ? `${rect.x}:${rect.y}:${rect.width}:${rect.height}` : ''
}

function dockStackKeyForWindow(item: OsWindowState): DockStackKey {
  if (item.kind === 'builtin' || item.kind === 'app') return 'apps'
  if (item.kind === 'workspace-file' || item.kind === 'chat-file') return 'files'
  return 'minimized'
}

function fallbackDockTargetRect(stackKey: DockStackKey): DOMRect | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null
  const dock = document.querySelector<HTMLElement>('[data-os-dock-bar="true"]')
  if (!dock) {
    return new DOMRect(window.innerWidth / 2 - 22, window.innerHeight - 42, 44, 30)
  }

  const rect = dock.getBoundingClientRect()
  const stackOrder: DockStackKey[] = ['apps', 'files', 'minimized']
  const index = stackOrder.indexOf(stackKey)
  const size = 42
  const rightInset = 10 + Math.max(0, stackOrder.length - 1 - index) * 48
  return new DOMRect(
    Math.max(rect.left + 8, rect.right - rightInset - size),
    rect.top + Math.max(4, (rect.height - size) / 2),
    size,
    size,
  )
}

function dockTargetRectForWindow(item: OsWindowState): DOMRect | null {
  if (typeof document === 'undefined') return null
  const stackKey = dockStackKeyForWindow(item)
  const target = document.querySelector<HTMLElement>(`[data-os-dock-stack="${stackKey}"]`)
  return target?.getBoundingClientRect() ?? fallbackDockTargetRect(stackKey)
}

function prefersReducedWindowMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clampUnit(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}

function easeInCubic(value: number) {
  const t = clampUnit(value)
  return t * t * t
}

function easeOutCubic(value: number) {
  const t = 1 - clampUnit(value)
  return 1 - t * t * t
}

function easeInOutCubic(value: number) {
  const t = clampUnit(value)
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function cssNumber(value: number) {
  return Number(value.toFixed(2))
}

function supportsCurvedClipPath() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('clip-path', 'path("M 0 0 L 1 0 L 1 1 L 0 1 Z")')
}

function curvedSuckClipPath(width: number, height: number, shape: number, originX: number) {
  const progress = clampUnit(shape)
  const shrink = easeOutCubic(progress)
  const topShape = clampUnit((progress - 0.62) / 0.38)
  const targetCenter = width * (originX / 100)
  const bottomHalf = width * lerp(0.5, 0.0025, shrink)
  const center = Math.min(
    Math.max(lerp(width / 2, targetCenter, shrink * 0.9), bottomHalf + 1),
    width - bottomHalf - 1,
  )
  const topInset = width * 0.08 * topShape * topShape
  const topLeft = topInset
  const topRight = width - topInset
  const bottomLeft = center - bottomHalf
  const bottomRight = center + bottomHalf
  const rightControlTop = lerp(width, width - width * 0.04, progress)
  const leftControlTop = lerp(0, width * 0.04, progress)
  const controlYTop = height * lerp(0.25, 0.2, progress)
  const controlYBottom = height * lerp(0.75, 0.86, progress)
  const curveReach = width * lerp(0.5, 0.035, shrink)
  const rightControlBottom = lerp(width, center + curveReach, shrink)
  const leftControlBottom = lerp(0, center - curveReach, shrink)

  return `path("M ${cssNumber(topLeft)} 0 L ${cssNumber(topRight)} 0 C ${cssNumber(
    rightControlTop,
  )} ${cssNumber(controlYTop)}, ${cssNumber(rightControlBottom)} ${cssNumber(
    controlYBottom,
  )}, ${cssNumber(bottomRight)} ${cssNumber(height)} L ${cssNumber(bottomLeft)} ${cssNumber(
    height,
  )} C ${cssNumber(leftControlBottom)} ${cssNumber(controlYBottom)}, ${cssNumber(
    leftControlTop,
  )} ${cssNumber(controlYTop)}, ${cssNumber(topLeft)} 0 Z")`
}

function polygonSuckClipPath(shape: number, originX: number) {
  const progress = clampUnit(shape)
  const shrink = easeOutCubic(progress)
  const topShape = clampUnit((progress - 0.62) / 0.38)
  const bottomHalf = lerp(50, 0.25, shrink)
  const center = Math.min(
    Math.max(lerp(50, originX, shrink * 0.9), bottomHalf + 1),
    100 - bottomHalf - 1,
  )
  const topInset = 8 * topShape * topShape
  return `polygon(${cssNumber(topInset)}% 0, ${cssNumber(100 - topInset)}% 0, ${cssNumber(
    center + bottomHalf,
  )}% 100%, ${cssNumber(center - bottomHalf)}% 100%)`
}

function windowEdgeClass(item: WindowRect, siblings: OsWindowState[]) {
  if (typeof window === 'undefined') return ''
  const tolerance = 1
  const edges = {
    bottom: item.y + item.height >= window.innerHeight - DOCK_RESERVED_HEIGHT - tolerance,
    left: item.x <= DESKTOP_EDGE_PADDING + tolerance,
    right: item.x + item.width >= window.innerWidth - DESKTOP_EDGE_PADDING - tolerance,
    top: item.y <= OS_TOP_BAR_HEIGHT + tolerance,
  }

  for (const sibling of siblings) {
    if (sibling.minimized) continue
    const siblingRect = sibling.maximized
      ? {
          height: window.innerHeight - OS_TOP_BAR_HEIGHT - DOCK_RESERVED_HEIGHT,
          width: window.innerWidth,
          x: 0,
          y: OS_TOP_BAR_HEIGHT,
        }
      : sibling
    const verticalOverlap = rectsOverlap(
      item.y,
      item.y + item.height,
      siblingRect.y,
      siblingRect.y + siblingRect.height,
    )
    const horizontalOverlap = rectsOverlap(
      item.x,
      item.x + item.width,
      siblingRect.x,
      siblingRect.x + siblingRect.width,
    )
    if (verticalOverlap && Math.abs(item.x - (siblingRect.x + siblingRect.width)) <= tolerance) {
      edges.left = true
    }
    if (verticalOverlap && Math.abs(item.x + item.width - siblingRect.x) <= tolerance) {
      edges.right = true
    }
    if (horizontalOverlap && Math.abs(item.y - (siblingRect.y + siblingRect.height)) <= tolerance) {
      edges.top = true
    }
    if (horizontalOverlap && Math.abs(item.y + item.height - siblingRect.y) <= tolerance) {
      edges.bottom = true
    }
  }

  return cn(
    edges.left && edges.top && 'rounded-tl-none',
    edges.right && edges.top && 'rounded-tr-none',
    edges.left && edges.bottom && 'rounded-bl-none',
    edges.right && edges.bottom && 'rounded-br-none',
  )
}

export function AppIcon({ iconUrl, className }: { iconUrl?: string | null; className?: string }) {
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
      className={cn('h-full w-full object-cover', className)}
      onError={() => setFailed(true)}
    />
  )
}

type OsDockButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  active?: boolean
  icon: ReactNode
  label: string
  badge?: number
  surface?: 'tile' | 'bare'
  wrapIcon?: boolean
}

export const OsDockButton = forwardRef<HTMLButtonElement, OsDockButtonProps>(function OsDockButton(
  {
    active,
    icon,
    label,
    badge,
    onClick,
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
      aria-label={label}
      className={cn(
        'group relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white/86 transition duration-150 hover:-translate-y-1 hover:scale-[1.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
        active && 'drop-shadow-[0_12px_24px_rgba(0,198,209,0.34)]',
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 max-w-48 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/12 bg-bg-secondary/95 px-2.5 py-1.5 text-xs font-black text-text-primary opacity-0 shadow-[0_14px_40px_rgba(0,0,0,0.36)] backdrop-blur-xl transition duration-150 group-hover:translate-y-[-2px] group-hover:opacity-100 group-focus-visible:opacity-100">
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
})

export function OsDockSeparator({ visible }: { visible: boolean }) {
  if (!visible) return null
  return <span className="mx-0.5 h-7 w-px shrink-0 self-center bg-white/16" />
}

function OsWindowTitleIcon({ item }: { item: OsWindowState }) {
  if (item.kind === 'app') return <AppIcon iconUrl={item.iconUrl} />
  if (item.kind === 'inbox') return <Inbox size={15} />
  if (item.kind === 'chat-file') return <FileText size={15} />
  if (item.kind === 'workspace-file') return <FileText size={15} />
  if (item.kind === 'builtin') {
    const className = osBuiltinIconToneClassName(item.builtinKey)
    if (item.builtinKey === 'workspace') return <Folder size={15} className={className} />
    if (item.builtinKey === 'app-store') return <Store size={15} className={className} />
    if (item.builtinKey === 'shop') return <ShoppingBag size={15} className={className} />
    if (item.builtinKey === 'settings') return <Settings size={15} className={className} />
    if (item.builtinKey === 'server-settings') return <Settings size={15} className={className} />
    if (item.builtinKey === 'profile') return <User size={15} />
    if (item.builtinKey === 'shadow-cloud') return <Cloud size={15} className={className} />
    if (item.builtinKey === 'discover') return <Compass size={15} className={className} />
    if (item.builtinKey === 'my-buddies') return <PawPrint size={15} className={className} />
  }
  return <Hash size={15} />
}

function OsAppWindowContent({
  app,
  serverSlug,
}: {
  app: ServerAppIntegration | null
  serverSlug: string
}) {
  const { t } = useTranslation()
  const { data: launch, isLoading } = useQuery({
    queryKey: ['os-server-app-launch', serverSlug, app?.appKey],
    queryFn: () =>
      fetchApi<LaunchContext>(`/api/servers/${serverSlug}/apps/${app!.appKey}/launch`, {
        method: 'POST',
      }),
    enabled: Boolean(serverSlug && app?.appKey && app?.iframeEntry),
    staleTime: 9 * 60 * 1000,
    gcTime: OS_GC_MS,
  })

  if (!app) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm font-bold text-text-muted">
        {t('os.windowUnavailable')}
      </div>
    )
  }

  const entry = launch?.iframeEntry ?? app.iframeEntry
  const iframeSrc = entry ? withLaunchParams(entry, launch) : null

  if (!app.iframeEntry) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border-subtle bg-bg-secondary/70 text-text-muted">
            <AppWindow size={21} />
          </div>
          <p className="mt-4 text-sm font-black text-text-primary">{app.name}</p>
          <p className="mt-2 text-sm font-semibold text-text-muted">{t('serverApps.noIframe')}</p>
        </div>
      </div>
    )
  }

  if (isLoading || !iframeSrc) {
    return (
      <div className="grid h-full place-items-center text-text-muted">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  return (
    <iframe
      key={iframeSrc}
      src={iframeSrc}
      title={app.name}
      className="block h-full min-h-0 w-full flex-1 border-0 bg-white"
      allow="clipboard-read; clipboard-write; fullscreen; microphone; camera"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
    />
  )
}

export function OsWindowFrame({
  item,
  focused,
  serverSlug,
  app,
  onClose,
  onFocus,
  onMinimize,
  onToggleMaximize,
  onRestoreForDrag,
  onMove,
  onResize,
  onPreviewFile,
  siblingWindows,
  children,
}: {
  item: OsWindowState
  focused: boolean
  serverSlug: string
  app: ServerAppIntegration | null
  onClose: (id: string) => void
  onFocus: (id: string) => void
  onMinimize: (id: string) => void
  onToggleMaximize: (id: string) => void
  onRestoreForDrag: (id: string, rect: WindowRect) => void
  onMove: (id: string, rect: WindowRect) => void
  onResize: (
    id: string,
    rect: { x: number; y: number; width: number; height: number },
    mode: ResizeMode,
    phase: 'preview' | 'commit',
  ) => void
  onPreviewFile?: (attachment: Attachment) => void
  siblingWindows: OsWindowState[]
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const frameRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    baseX: number
    baseY: number
    baseWidth: number
    baseHeight: number
    lastTranslateX: number
    lastTranslateY: number
    lastRect: WindowRect
    lastSnapRect: WindowRect | null
    snapEnteredAt: number
    snapTargetKey: string | null
    wasMaximized: boolean
    restoredFromMaximized: boolean
    hasMoved: boolean
    raf: number | null
  } | null>(null)
  const suppressDoubleClickRef = useRef(false)
  const resizeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startLeft: number
    startTop: number
    startWidth: number
    startHeight: number
    lastX: number
    lastY: number
    lastWidth: number
    lastHeight: number
    mode: ResizeMode
    raf: number | null
  } | null>(null)
  const [dragSnapPreview, setDragSnapPreview] = useState<WindowRect | null>(null)
  const [controlMenuOpen, setControlMenuOpen] = useState(false)
  const isMinimizingRef = useRef(false)
  const controlMenuTimerRef = useRef<number | null>(null)
  const controlMenuSuppressedUntilRef = useRef(0)

  const clearControlMenuTimer = () => {
    if (controlMenuTimerRef.current === null) return
    window.clearTimeout(controlMenuTimerRef.current)
    controlMenuTimerRef.current = null
  }

  const scheduleControlMenuOpen = () => {
    if (Date.now() < controlMenuSuppressedUntilRef.current) return
    clearControlMenuTimer()
    controlMenuTimerRef.current = window.setTimeout(() => {
      setControlMenuOpen(true)
      controlMenuTimerRef.current = null
    }, 360)
  }

  const scheduleControlMenuClose = () => {
    clearControlMenuTimer()
    controlMenuTimerRef.current = window.setTimeout(() => {
      setControlMenuOpen(false)
      controlMenuTimerRef.current = null
    }, 160)
  }

  const dismissControlMenuForAction = () => {
    controlMenuSuppressedUntilRef.current = Date.now() + 450
    clearControlMenuTimer()
    setControlMenuOpen(false)
  }

  const minimizeWithDockAnimation = () => {
    if (isMinimizingRef.current) return
    const node = frameRef.current
    const target = dockTargetRectForWindow(item)
    if (!node || !target || prefersReducedWindowMotion()) {
      onMinimize(item.id)
      return
    }

    const source = node.getBoundingClientRect()
    const targetCenterX = target.left + target.width / 2
    const originX = Math.min(
      88,
      Math.max(12, ((targetCenterX - source.left) / Math.max(source.width, 1)) * 100),
    )
    const sourceAnchorX = source.left + source.width * (originX / 100)
    const sourceAnchorY = source.bottom
    const targetEntryY = target.top + Math.min(5, target.height * 0.14)
    const finalScaleX = Math.min(
      Math.max((target.width / Math.max(source.width, 1)) * 0.24, 0.008),
      0.028,
    )
    const finalScaleY = Math.min(
      Math.max((target.height / Math.max(source.height, 1)) * 0.24, 0.012),
      0.034,
    )
    const deltaX = targetCenterX - sourceAnchorX
    const deltaY = targetEntryY - sourceAnchorY
    const canUseCurvedClip = supportsCurvedClipPath()
    const duration = 1240

    isMinimizingRef.current = true
    node.style.pointerEvents = 'none'
    node.style.transformOrigin = `${originX}% 100%`
    node.style.willChange = 'clip-path, filter, opacity, transform'

    const startedAt = performance.now()
    const applyFrame = (progress: number) => {
      const t = clampUnit(progress)
      const settle = t < 0.24 ? easeOutCubic(t / 0.24) : 1
      const pull = t <= 0.24 ? 0 : easeInOutCubic((Math.min(t, 0.62) - 0.24) / 0.38)
      const curve = t <= 0.42 ? 0 : easeInOutCubic((Math.min(t, 0.82) - 0.42) / 0.4)
      const gulp = t <= 0.82 ? 0 : easeInCubic((t - 0.82) / 0.18)
      const shape = clampUnit(pull * 0.2 + curve * 0.76 + gulp * 0.04)
      const moveX = deltaX * (pull * 0.035 + curve * 0.84 + gulp * 0.125)
      const moveY = deltaY * (pull * 0.055 + curve * 0.84 + gulp * 0.105)
      const earlyPress = Math.sin(settle * Math.PI) * 0.006
      const midScaleX = lerp(1 + earlyPress, 0.96, pull)
      const midScaleY = lerp(1 - earlyPress, 0.88, pull)
      const pulledScaleX = lerp(midScaleX, Math.max(finalScaleX * 3.2, 0.055), curve)
      const pulledScaleY = lerp(midScaleY, Math.max(finalScaleY * 4.2, 0.085), curve)
      const currentScaleX = lerp(pulledScaleX, finalScaleX, gulp)
      const currentScaleY = lerp(pulledScaleY, finalScaleY, gulp)

      node.style.borderRadius = `${cssNumber(18 + shape * 8)}px`
      node.style.clipPath = canUseCurvedClip
        ? curvedSuckClipPath(source.width, source.height, shape, originX)
        : polygonSuckClipPath(shape, originX)
      node.style.filter = `blur(${cssNumber(curve * 0.18 + gulp * 0.72)}px)`
      node.style.opacity = String(cssNumber(Math.max(0.12, 1 - curve * 0.2 - gulp * 0.68)))
      node.style.transform = `translate3d(${cssNumber(moveX)}px, ${cssNumber(
        moveY,
      )}px, 0) scale(${cssNumber(currentScaleX)}, ${cssNumber(currentScaleY)})`
    }

    const finishAnimation = () => {
      applyFrame(1)
      isMinimizingRef.current = false
      node.style.visibility = 'hidden'
      node.style.pointerEvents = ''
      node.style.transformOrigin = ''
      node.style.willChange = ''
      onMinimize(item.id)
    }

    const tick = (now: number) => {
      const progress = (now - startedAt) / duration
      applyFrame(progress)
      if (progress < 1) {
        window.requestAnimationFrame(tick)
        return
      }
      finishAnimation()
    }

    try {
      applyFrame(0)
      window.requestAnimationFrame(tick)
    } catch {
      window.setTimeout(() => {
        isMinimizingRef.current = false
        node.style.visibility = 'hidden'
        node.style.pointerEvents = ''
        node.style.transformOrigin = ''
        node.style.willChange = ''
        onMinimize(item.id)
      }, duration)
    }
  }

  useEffect(() => clearControlMenuTimer, [])

  if (item.minimized) return null

  const displayRect = item.maximized
    ? {
        height:
          typeof window === 'undefined'
            ? item.height
            : window.innerHeight - OS_TOP_BAR_HEIGHT - DOCK_RESERVED_HEIGHT,
        width: typeof window === 'undefined' ? item.width : window.innerWidth,
        x: 0,
        y: OS_TOP_BAR_HEIGHT,
      }
    : {
        height: item.height,
        width: item.width,
        x: item.x,
        y: item.y,
      }
  const windowStyle = item.maximized
    ? {
        left: 0,
        right: 0,
        top: OS_TOP_BAR_HEIGHT,
        bottom: DOCK_RESERVED_HEIGHT,
        zIndex: item.z,
      }
    : {
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.z,
      }

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const baseRect = item.maximized
      ? clampWindowPosition({
          x: event.clientX - item.width * (event.clientX / Math.max(1, window.innerWidth)),
          y: event.clientY - 22,
          width: item.width,
          height: item.height,
        })
      : {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: baseRect.x,
      baseY: baseRect.y,
      baseWidth: baseRect.width,
      baseHeight: baseRect.height,
      lastTranslateX: 0,
      lastTranslateY: 0,
      lastRect: baseRect,
      lastSnapRect: null,
      snapEnteredAt: 0,
      snapTargetKey: null,
      wasMaximized: item.maximized,
      restoredFromMaximized: false,
      hasMoved: false,
      raf: null,
    }
    setDragSnapPreview(null)
    onFocus(item.id)
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    const hasCrossedMoveThreshold = Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4
    if (hasCrossedMoveThreshold && drag.wasMaximized && !drag.restoredFromMaximized) {
      onRestoreForDrag(item.id, drag.lastRect)
      drag.restoredFromMaximized = true
    }
    drag.hasMoved = drag.hasMoved || hasCrossedMoveThreshold
    const next = clampWindowPosition({
      x: drag.baseX + deltaX,
      y: drag.baseY + deltaY,
      width: drag.baseWidth,
      height: drag.baseHeight,
    })
    const snapRect = snapWindowToPointer(next, { x: event.clientX, y: event.clientY })
    const nextSnapTargetKey = rectChanged(next, snapRect) ? rectKey(snapRect) : null
    const now = performance.now()
    if (nextSnapTargetKey && nextSnapTargetKey !== drag.snapTargetKey) {
      drag.snapTargetKey = nextSnapTargetKey
      drag.snapEnteredAt = now
    }
    if (!nextSnapTargetKey) {
      drag.snapTargetKey = null
      drag.snapEnteredAt = 0
    }
    drag.lastTranslateX = next.x - drag.baseX
    drag.lastTranslateY = next.y - drag.baseY
    drag.lastRect = next
    drag.lastSnapRect =
      nextSnapTargetKey && now - drag.snapEnteredAt >= OS_SNAP_DWELL_MS ? snapRect : null
    if (drag.raf !== null) return
    drag.raf = window.requestAnimationFrame(() => {
      drag.raf = null
      if (frameRef.current) {
        frameRef.current.style.transform = `translate3d(${drag.lastTranslateX}px, ${drag.lastTranslateY}px, 0)`
      }
      setDragSnapPreview(drag.lastSnapRect)
    })
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.raf !== null) {
      window.cancelAnimationFrame(drag.raf)
    }
    dragRef.current = null
    if (frameRef.current) {
      frameRef.current.style.transform = ''
    }
    setDragSnapPreview(null)
    if (!drag.hasMoved) return
    if (drag.hasMoved) {
      suppressDoubleClickRef.current = true
      window.setTimeout(() => {
        suppressDoubleClickRef.current = false
      }, 220)
    }
    onMove(item.id, drag.lastSnapRect ?? drag.lastRect)
  }

  const clampResize = (next: { x: number; y: number; width: number; height: number }) => {
    if (typeof window === 'undefined') return next
    const rect = clampWindowResize({
      x: next.x,
      y: next.y,
      width: next.width,
      height: next.height,
    })
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }
  }

  const handleResizeStart = (mode: ResizeMode) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (item.maximized) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: item.x,
      startTop: item.y,
      startWidth: item.width,
      startHeight: item.height,
      lastX: item.x,
      lastY: item.y,
      lastWidth: item.width,
      lastHeight: item.height,
      mode,
      raf: null,
    }
    onFocus(item.id)
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const deltaX = event.clientX - resize.startX
    const deltaY = event.clientY - resize.startY
    const right = resize.startLeft + resize.startWidth
    const bottom = resize.startTop + resize.startHeight
    const isLeft = resize.mode.includes('left')
    const isRight = resize.mode.includes('right')
    const isTop = resize.mode.includes('top')
    const isBottom = resize.mode.includes('bottom')
    const nextX = isLeft
      ? Math.min(
          Math.max(DESKTOP_EDGE_PADDING, resize.startLeft + deltaX),
          right - MIN_WINDOW_WIDTH,
        )
      : resize.startLeft
    const nextY = isTop
      ? Math.min(Math.max(OS_TOP_BAR_HEIGHT, resize.startTop + deltaY), bottom - MIN_WINDOW_HEIGHT)
      : resize.startTop
    const nextWidth = isLeft
      ? right - nextX
      : isRight
        ? resize.startWidth + deltaX
        : resize.startWidth
    const nextHeight = isTop
      ? bottom - nextY
      : isBottom
        ? resize.startHeight + deltaY
        : resize.startHeight
    const next = clampResize({ x: nextX, y: nextY, width: nextWidth, height: nextHeight })
    resize.lastX = next.x
    resize.lastY = next.y
    resize.lastWidth = next.width
    resize.lastHeight = next.height
    if (resize.raf !== null) return
    resize.raf = window.requestAnimationFrame(() => {
      resize.raf = null
      const liveRect = {
        x: resize.lastX,
        y: resize.lastY,
        width: resize.lastWidth,
        height: resize.lastHeight,
      }
      onResize(item.id, liveRect, resize.mode, 'preview')
    })
  }

  const handleResizeEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    if (resize.raf !== null) {
      window.cancelAnimationFrame(resize.raf)
    }
    resizeRef.current = null
    onResize(
      item.id,
      {
        x: resize.lastX,
        y: resize.lastY,
        width: resize.lastWidth,
        height: resize.lastHeight,
      },
      resize.mode,
      'commit',
    )
  }

  const handleTitleBarDoubleClick = () => {
    if (suppressDoubleClickRef.current || dragRef.current?.hasMoved) return
    onToggleMaximize(item.id)
  }

  return (
    <>
      {dragSnapPreview ? (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none fixed rounded-[18px] border-2 border-primary/80 bg-primary/14 shadow-[0_0_0_1px_rgba(255,255,255,0.16)_inset,0_20px_70px_rgba(0,198,209,0.20)] backdrop-blur-sm',
            windowEdgeClass(
              dragSnapPreview,
              siblingWindows.filter((sibling) => sibling.id !== item.id),
            ),
          )}
          style={{
            left: dragSnapPreview.x,
            top: dragSnapPreview.y,
            width: dragSnapPreview.width,
            height: dragSnapPreview.height,
            zIndex: item.z + 1,
          }}
        />
      ) : null}
      <section
        ref={frameRef}
        className={cn(
          'absolute flex min-h-[320px] min-w-[420px] flex-col overflow-hidden rounded-[18px] border bg-bg-primary/96 shadow-[0_26px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl transition-shadow will-change-transform',
          windowEdgeClass(
            displayRect,
            siblingWindows.filter((sibling) => sibling.id !== item.id),
          ),
          'border-white/14',
        )}
        style={windowStyle}
        data-focused={focused ? 'true' : undefined}
        onPointerDown={() => onFocus(item.id)}
      >
        <div
          className="flex h-10 shrink-0 touch-none select-none items-center gap-3 border-b border-border-subtle/60 bg-bg-secondary/86 px-3"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onDoubleClick={handleTitleBarDoubleClick}
        >
          <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-lg bg-bg-tertiary text-text-muted">
            <OsWindowTitleIcon item={item} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-text-primary">{item.title}</p>
          </div>
          <div
            className="relative ml-auto grid h-8 w-8 shrink-0 place-items-center"
            onPointerEnter={scheduleControlMenuOpen}
            onPointerLeave={scheduleControlMenuClose}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                dismissControlMenuForAction()
                minimizeWithDockAnimation()
              }}
              className="group/window-control grid h-8 w-8 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffbd2e]/45"
              title={t('os.minimizeWindow')}
              aria-label={t('os.minimizeWindow')}
            >
              <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-black/18 bg-[#ffbd2e] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] transition hover:brightness-110">
                <svg
                  viewBox="0 0 14 14"
                  aria-hidden="true"
                  className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/window-control:opacity-80"
                >
                  <path
                    d="M3.5 7h7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                    className="text-black/70"
                  />
                </svg>
              </span>
            </button>
            {controlMenuOpen ? (
              <div
                className="absolute right-0 top-8 z-50 w-28 overflow-hidden rounded-2xl border border-white/12 bg-bg-secondary/98 p-1 text-sm font-bold text-text-secondary shadow-[0_18px_58px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
                onPointerEnter={() => {
                  clearControlMenuTimer()
                  setControlMenuOpen(true)
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/8 hover:text-text-primary"
                  onClick={(event) => {
                    event.stopPropagation()
                    dismissControlMenuForAction()
                    minimizeWithDockAnimation()
                  }}
                >
                  <span className="block truncate">{t('os.hide')}</span>
                </button>
                <button
                  type="button"
                  className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/8 hover:text-text-primary"
                  onClick={(event) => {
                    event.stopPropagation()
                    dismissControlMenuForAction()
                    onToggleMaximize(item.id)
                  }}
                >
                  <span className="block truncate">{t('os.maximize')}</span>
                </button>
                <button
                  type="button"
                  className="block w-full rounded-xl px-3 py-2 text-left text-danger transition hover:bg-danger/10"
                  onClick={(event) => {
                    event.stopPropagation()
                    dismissControlMenuForAction()
                    onClose(item.id)
                  }}
                >
                  <span className="block truncate">{t('os.close')}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {item.kind === 'builtin' ||
          item.kind === 'workspace-file' ||
          item.kind === 'chat-file' ? (
            children
          ) : item.kind === 'app' ? (
            <OsAppWindowContent app={app} serverSlug={serverSlug} />
          ) : item.channelId ? (
            <ChannelView
              key={`${item.kind}:${item.channelId}`}
              channelId={item.channelId}
              serverSlug={serverSlug}
              onPreviewFile={onPreviewFile}
            />
          ) : (
            <div className="grid h-full flex-1 place-items-center text-sm font-bold text-text-muted">
              {t('os.windowUnavailable')}
            </div>
          )}
        </div>
        {!item.maximized && (
          <>
            <button
              type="button"
              tabIndex={-1}
              className="absolute left-5 right-5 top-0 z-20 h-2 cursor-ns-resize bg-transparent"
              aria-label={t('os.resizeWindow')}
              title={t('os.resizeWindow')}
              onPointerDown={handleResizeStart('top')}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute bottom-0 left-5 right-5 z-20 h-2 cursor-ns-resize bg-transparent"
              aria-label={t('os.resizeWindow')}
              title={t('os.resizeWindow')}
              onPointerDown={handleResizeStart('bottom')}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute bottom-5 left-0 top-5 z-20 w-2 cursor-ew-resize bg-transparent"
              aria-label={t('os.resizeWindow')}
              title={t('os.resizeWindow')}
              onPointerDown={handleResizeStart('left')}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute bottom-5 right-0 top-5 z-20 w-2 cursor-ew-resize bg-transparent"
              aria-label={t('os.resizeWindow')}
              title={t('os.resizeWindow')}
              onPointerDown={handleResizeStart('right')}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute left-0 top-0 z-30 h-5 w-5 cursor-nwse-resize bg-transparent"
              aria-label={t('os.resizeWindow')}
              title={t('os.resizeWindow')}
              onPointerDown={handleResizeStart('top-left')}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-0 top-0 z-30 h-5 w-5 cursor-nesw-resize bg-transparent"
              aria-label={t('os.resizeWindow')}
              title={t('os.resizeWindow')}
              onPointerDown={handleResizeStart('top-right')}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute bottom-0 left-0 z-30 h-5 w-5 cursor-nesw-resize bg-transparent"
              aria-label={t('os.resizeWindow')}
              title={t('os.resizeWindow')}
              onPointerDown={handleResizeStart('bottom-left')}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute bottom-0 right-0 z-30 h-5 w-5 cursor-nwse-resize rounded-tl-lg bg-transparent after:absolute after:bottom-1.5 after:right-1.5 after:h-2.5 after:w-2.5 after:rounded-br-md after:border-b after:border-r after:border-white/30"
              aria-label={t('os.resizeWindow')}
              title={t('os.resizeWindow')}
              onPointerDown={handleResizeStart('bottom-right')}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
            />
          </>
        )}
      </section>
    </>
  )
}
