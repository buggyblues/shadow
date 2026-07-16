import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBuddyInboxSummary,
} from '@shadowob/sdk/bridge'
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { AppWindow, FileText, Hash, Inbox, Loader2, Menu } from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  forwardRef,
  memo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
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
import { OsAppWindowContent } from './app-window-content'
import type { OsBridgeBuddyCreatorLanding, OsBridgeBuddyCreatorResult } from './bridge-utils'
import { OsWindowTitleIcon } from './icon-and-dock'
import { maximizedWindowTabPortalId, OsMaximizedWindowTab } from './widgets/maximized-window-tab'
import {
  clampUnit,
  cssNumber,
  curvedSuckClipPath,
  dockTargetRectForWindow,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  polygonSuckClipPath,
  prefersReducedWindowMotion,
  type ResizeMode,
  rectChanged,
  rectKey,
  supportsCurvedClipPath,
  type WindowRect,
  windowEdgeClass,
} from './window-geometry'
import { OsWindowHeaderToolsContext, useOsWindowHeaderToolsController } from './window-header-tools'
import {
  OsWindowMenuContext,
  type OsWindowMenuItem,
  useOsWindowMenuController,
} from './window-menu'
import { shouldUseWindowBackdrop } from './window-performance'

type OsWindowFrameProps = {
  item: OsWindowState
  focused: boolean
  showMaximizedTab: boolean
  serverSlug: string
  app: SpaceAppInstallation | null
  edgeClassName: string
  contentRevision?: unknown
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
  onAppRouteChange?: (id: string, path: string) => void
  onOpenChannel?: (input: { channelId: string; messageId?: string }) => Promise<boolean>
  onOpenInbox?: (input: { agentId?: string; channelId?: string }) => Promise<boolean>
  onOpenBuddyCreator?: (input: {
    landing?: OsBridgeBuddyCreatorLanding
  }) => Promise<OsBridgeBuddyCreatorResult>
  onOpenWorkspaceResource?: (input: {
    workspaceFileId?: string
    workspaceNodeId?: string
  }) => Promise<boolean>
  siblingWindows: OsWindowState[]
  children?: ReactNode
}

type OsWindowDragState = {
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
  previewSnapKey: string
  snapEnteredAt: number
  snapTargetKey: string | null
  wasMaximized: boolean
  restoredFromMaximized: boolean
  hasMoved: boolean
  raf: number | null
}

function windowMenuItemKey(item: OsWindowMenuItem, index: number) {
  return item.type === 'separator' ? (item.id ?? `separator-${index}`) : item.id
}

function OsWindowMenuItems({ items }: { items: OsWindowMenuItem[] }) {
  return items.map((menuItem, index) => {
    if (menuItem.type === 'separator') {
      return <DropdownMenuSeparator key={windowMenuItemKey(menuItem, index)} />
    }

    const icon = menuItem.icon ? (
      <span className="grid h-4 w-4 shrink-0 place-items-center text-text-muted">
        {menuItem.icon}
      </span>
    ) : null

    if (menuItem.type === 'submenu') {
      const hasItems = menuItem.items.length > 0
      return (
        <DropdownMenuSub key={menuItem.id}>
          <DropdownMenuSubTrigger
            disabled={menuItem.disabled || !hasItems}
            className="gap-2 rounded-xl px-3 py-2 text-sm font-bold normal-case tracking-normal focus:bg-white/10 focus:text-text-primary data-[state=open]:bg-white/10 data-[state=open]:text-text-primary"
          >
            {icon}
            <span className="min-w-0 flex-1 truncate">{menuItem.label}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={8}
            className="min-w-[168px] rounded-2xl border-white/12 bg-bg-secondary/96 p-1"
          >
            <OsWindowMenuItems items={menuItem.items} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    }

    return (
      <DropdownMenuItem
        key={menuItem.id}
        disabled={menuItem.disabled}
        variant={menuItem.danger ? 'danger' : 'default'}
        className="gap-2 rounded-xl px-3 py-2 text-sm font-bold normal-case tracking-normal focus:bg-white/10 focus:text-text-primary"
        onSelect={menuItem.onSelect}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{menuItem.label}</span>
      </DropdownMenuItem>
    )
  })
}

function OsWindowFrameComponent({
  item,
  focused,
  showMaximizedTab,
  serverSlug,
  app,
  edgeClassName,
  onClose,
  onFocus,
  onMinimize,
  onToggleMaximize,
  onRestoreForDrag,
  onMove,
  onResize,
  onPreviewFile,
  onAppRouteChange,
  onOpenChannel,
  onOpenInbox,
  onOpenBuddyCreator,
  onOpenWorkspaceResource,
  siblingWindows,
  children,
}: OsWindowFrameProps) {
  const { t } = useTranslation()
  const frameRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<OsWindowDragState | null>(null)
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
  const [headerToolSlots, setHeaderToolSlots] = useState<Record<string, ReactNode>>({})
  const [headerSearchSlots, setHeaderSearchSlots] = useState<Record<string, ReactNode>>({})
  const [windowMenuSlots, setWindowMenuSlots] = useState<Record<string, OsWindowMenuItem[]>>({})
  const [maximizedTabPortalTarget, setMaximizedTabPortalTarget] = useState<HTMLElement | null>(null)
  const isMinimizingRef = useRef(false)
  const controlMenuTimerRef = useRef<number | null>(null)
  const controlMenuSuppressedUntilRef = useRef(0)
  const headerToolsController = useOsWindowHeaderToolsController(
    setHeaderToolSlots,
    setHeaderSearchSlots,
  )
  const headerTools = Object.entries(headerToolSlots)
  const headerSearches = Object.entries(headerSearchSlots)
  const windowMenuController = useOsWindowMenuController(setWindowMenuSlots)
  const windowMenuItems = useMemo(() => {
    const groups = Object.entries(windowMenuSlots).filter(([, items]) => items.length > 0)
    return groups.flatMap(([slotId, items], index) =>
      index === 0 ? items : [{ type: 'separator' as const, id: `${slotId}-separator` }, ...items],
    )
  }, [windowMenuSlots])

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

  const applyRestoredDragFrame = (drag: OsWindowDragState) => {
    if (!drag.wasMaximized || drag.restoredFromMaximized) return
    const node = frameRef.current
    if (!node) return
    node.style.left = `${drag.baseX}px`
    node.style.top = `${drag.baseY}px`
    node.style.width = `${drag.baseWidth}px`
    node.style.height = `${drag.baseHeight}px`
    node.style.right = ''
    node.style.bottom = ''
    drag.restoredFromMaximized = true
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

  useEffect(() => {
    if (!showMaximizedTab || !item.maximized || typeof document === 'undefined') {
      setMaximizedTabPortalTarget(null)
      return
    }
    setMaximizedTabPortalTarget(document.getElementById(maximizedWindowTabPortalId(item.id)))
  }, [item.id, item.maximized, showMaximizedTab])

  if (item.minimized) return null

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
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (frameRef.current) {
      frameRef.current.style.willChange = 'transform'
    }
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
      previewSnapKey: '',
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
    event.preventDefault()
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    const hasCrossedMoveThreshold = Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4
    if (!drag.hasMoved && !hasCrossedMoveThreshold) return
    if (hasCrossedMoveThreshold) applyRestoredDragFrame(drag)
    drag.hasMoved = true
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
    const nextPreviewSnapKey = rectKey(drag.lastSnapRect)
    if (nextPreviewSnapKey !== drag.previewSnapKey) {
      drag.previewSnapKey = nextPreviewSnapKey
      setDragSnapPreview(drag.lastSnapRect)
    }
    if (drag.raf !== null) return
    drag.raf = window.requestAnimationFrame(() => {
      drag.raf = null
      if (frameRef.current) {
        frameRef.current.style.transform = `translate3d(${drag.lastTranslateX}px, ${drag.lastTranslateY}px, 0)`
      }
    })
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.raf !== null) {
      window.cancelAnimationFrame(drag.raf)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    const commitRect = drag.lastSnapRect ?? drag.lastRect
    if (frameRef.current) {
      if (drag.hasMoved) {
        frameRef.current.style.left = `${commitRect.x}px`
        frameRef.current.style.top = `${commitRect.y}px`
        frameRef.current.style.width = `${commitRect.width}px`
        frameRef.current.style.height = `${commitRect.height}px`
        frameRef.current.style.right = ''
        frameRef.current.style.bottom = ''
      }
      frameRef.current.style.transform = ''
      frameRef.current.style.willChange = ''
    }
    setDragSnapPreview(null)
    if (!drag.hasMoved) return
    if (drag.hasMoved) {
      suppressDoubleClickRef.current = true
      window.setTimeout(() => {
        suppressDoubleClickRef.current = false
      }, 220)
    }
    if (drag.wasMaximized) {
      onRestoreForDrag(item.id, commitRect)
      return
    }
    onMove(item.id, commitRect)
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

  const maximizedWindowTab =
    item.maximized && showMaximizedTab && maximizedTabPortalTarget
      ? createPortal(
          <OsMaximizedWindowTab
            item={item}
            headerTools={headerTools}
            headerSearches={headerSearches}
            windowMenuItems={windowMenuItems}
            onRestore={() => onToggleMaximize(item.id)}
            onMinimize={minimizeWithDockAnimation}
            onClose={() => onClose(item.id)}
          />,
          maximizedTabPortalTarget,
        )
      : null
  const useBackdropBlur = shouldUseWindowBackdrop({ ...item, focused })

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
          'pointer-events-auto absolute flex min-h-[320px] min-w-[420px] flex-col overflow-hidden rounded-[18px] border shadow-[0_26px_80px_rgba(0,0,0,0.38)] transition-shadow',
          useBackdropBlur
            ? 'bg-bg-primary/62 backdrop-blur-[32px] backdrop-saturate-150'
            : 'bg-bg-primary/96',
          edgeClassName,
          'border-white/14',
          item.maximized && 'border-t-transparent',
        )}
        style={windowStyle}
        data-focused={focused ? 'true' : undefined}
        data-window-backdrop={useBackdropBlur ? 'enabled' : 'disabled'}
        onPointerDown={() => onFocus(item.id)}
      >
        <OsWindowHeaderToolsContext.Provider value={headerToolsController}>
          <OsWindowMenuContext.Provider value={windowMenuController}>
            {maximizedWindowTab}
            {!item.maximized ? (
              <div
                className="relative z-10 flex h-10 shrink-0 touch-none select-none items-center gap-3 bg-transparent px-3"
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                onDoubleClick={handleTitleBarDoubleClick}
              >
                <OsWindowTitleIcon item={item} />
                <div className="min-w-0 shrink">
                  <p className="truncate text-sm font-black text-text-primary">{item.title}</p>
                </div>
                {headerTools.length > 0 ? (
                  <div
                    className="flex h-8 shrink-0 items-center gap-1.5"
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    {headerTools.map(([slotId, tools]) => (
                      <div key={slotId} className="contents">
                        {tools}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="min-w-0 flex-1" />
                <div
                  className="flex h-8 shrink-0 items-center gap-1"
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  {headerSearches.length > 0 ? (
                    <div className="flex min-w-0 max-w-[min(360px,42vw)] shrink-0 items-center">
                      {headerSearches.map(([slotId, search]) => (
                        <div key={slotId} className="min-w-0 flex-1">
                          {search}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {windowMenuItems.length > 0 ? (
                    <div className="grid h-8 w-8 shrink-0 place-items-center">
                      <DropdownMenu
                        trigger={
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-full text-text-muted transition hover:bg-white/8 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            title={t('os.windowMenu')}
                            aria-label={t('os.windowMenu')}
                          >
                            <Menu size={16} strokeWidth={2.2} />
                          </button>
                        }
                      >
                        <DropdownMenuContent
                          align="end"
                          sideOffset={8}
                          className="min-w-[180px] rounded-2xl border-white/12 bg-bg-secondary/96 p-1"
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <OsWindowMenuItems items={windowMenuItems} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                  <div
                    className="relative grid h-8 w-8 shrink-0 place-items-center"
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
                        onClose(item.id)
                      }}
                      className="group/window-control grid h-8 w-8 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5f57]/45"
                      title={t('os.closeWindow')}
                      aria-label={t('os.closeWindow')}
                    >
                      <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-black/18 bg-[#ff5f57] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] transition hover:brightness-110">
                        <svg
                          viewBox="0 0 14 14"
                          aria-hidden="true"
                          className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/window-control:opacity-80"
                        >
                          <path
                            d="M4.2 4.2 9.8 9.8M9.8 4.2 4.2 9.8"
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
                        className="absolute right-0 top-8 z-50 w-28 select-none overflow-hidden rounded-2xl border border-white/12 bg-bg-secondary/98 p-1 text-sm font-bold text-text-secondary shadow-[0_18px_58px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
                        onPointerEnter={() => {
                          clearControlMenuTimer()
                          setControlMenuOpen(true)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="block w-full select-none rounded-xl px-3 py-2 text-left transition hover:bg-white/8 hover:text-text-primary"
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
                          className="block w-full select-none rounded-xl px-3 py-2 text-left transition hover:bg-white/8 hover:text-text-primary"
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
              </div>
            ) : null}
            <div className="relative z-0 grid min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-transparent">
              {item.kind === 'builtin' ||
              item.kind === 'workspace-file' ||
              item.kind === 'chat-file' ||
              item.kind === 'voice-screen' ? (
                children
              ) : item.kind === 'app' ? (
                <OsAppWindowContent
                  app={app}
                  appPath={item.appPath}
                  focused={focused}
                  serverSlug={serverSlug}
                  windowId={item.id}
                  onRouteChange={onAppRouteChange}
                  onOpenChannel={onOpenChannel}
                  onOpenInbox={onOpenInbox}
                  onOpenBuddyCreator={onOpenBuddyCreator}
                  onOpenWorkspaceResource={onOpenWorkspaceResource}
                />
              ) : item.channelId ? (
                <ChannelView
                  key={`${item.kind}:${item.channelId}`}
                  channelId={item.channelId}
                  serverSlug={serverSlug}
                  onPreviewFile={onPreviewFile}
                />
              ) : (
                <div className="grid h-full min-h-0 w-full min-w-0 flex-1 place-items-center text-sm font-bold text-text-muted">
                  {t('os.windowUnavailable')}
                </div>
              )}
            </div>
          </OsWindowMenuContext.Provider>
        </OsWindowHeaderToolsContext.Provider>
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

function areOsWindowFramePropsEqual(prev: OsWindowFrameProps, next: OsWindowFrameProps) {
  return (
    prev.item === next.item &&
    prev.focused === next.focused &&
    prev.showMaximizedTab === next.showMaximizedTab &&
    prev.serverSlug === next.serverSlug &&
    prev.app === next.app &&
    prev.edgeClassName === next.edgeClassName &&
    prev.contentRevision === next.contentRevision &&
    prev.onClose === next.onClose &&
    prev.onFocus === next.onFocus &&
    prev.onMinimize === next.onMinimize &&
    prev.onToggleMaximize === next.onToggleMaximize &&
    prev.onRestoreForDrag === next.onRestoreForDrag &&
    prev.onMove === next.onMove &&
    prev.onResize === next.onResize &&
    prev.onPreviewFile === next.onPreviewFile &&
    prev.onAppRouteChange === next.onAppRouteChange &&
    prev.onOpenInbox === next.onOpenInbox &&
    prev.onOpenBuddyCreator === next.onOpenBuddyCreator
  )
}

export const OsWindowFrame = memo(OsWindowFrameComponent, areOsWindowFramePropsEqual)
