import {
  SHADOW_BRIDGE_CAPABILITIES,
  ShadowBridge,
  type ShadowBuddyInboxSummary,
} from '@shadowob/sdk/bridge'
import { cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { AppWindow, FileText, Hash, Inbox, Loader2 } from 'lucide-react'
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

export type ResizeMode =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export type WindowRect = Pick<OsWindowState, 'x' | 'y' | 'width' | 'height'>
export type DockStackKey = 'apps' | 'files' | 'minimized'

export function rectChanged(left: WindowRect | null, right: WindowRect | null) {
  if (!left || !right) return left !== right
  return (
    left.x !== right.x ||
    left.y !== right.y ||
    left.width !== right.width ||
    left.height !== right.height
  )
}

export function rectsOverlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(startA, startB) < Math.min(endA, endB)
}

export function rectKey(rect: WindowRect | null) {
  return rect ? `${rect.x}:${rect.y}:${rect.width}:${rect.height}` : ''
}

export function dockStackKeyForWindow(item: OsWindowState): DockStackKey {
  if (item.kind === 'builtin' || item.kind === 'app') return 'apps'
  if (item.kind === 'workspace-file' || item.kind === 'chat-file') return 'files'
  return 'minimized'
}

export function fallbackDockTargetRect(stackKey: DockStackKey): DOMRect | null {
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

export function dockTargetRectForWindow(item: OsWindowState): DOMRect | null {
  if (typeof document === 'undefined') return null
  const stackKey = dockStackKeyForWindow(item)
  const target = document.querySelector<HTMLElement>(`[data-os-dock-stack="${stackKey}"]`)
  return target?.getBoundingClientRect() ?? fallbackDockTargetRect(stackKey)
}

export function prefersReducedWindowMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function clampUnit(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

export function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}

export function easeInCubic(value: number) {
  const t = clampUnit(value)
  return t * t * t
}

export function easeOutCubic(value: number) {
  const t = 1 - clampUnit(value)
  return 1 - t * t * t
}

export function easeInOutCubic(value: number) {
  const t = clampUnit(value)
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function cssNumber(value: number) {
  return Number(value.toFixed(2))
}

export function supportsCurvedClipPath() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('clip-path', 'path("M 0 0 L 1 0 L 1 1 L 0 1 Z")')
}

export function curvedSuckClipPath(width: number, height: number, shape: number, originX: number) {
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

export function polygonSuckClipPath(shape: number, originX: number) {
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

export function windowEdgeClass(item: WindowRect, siblings: OsWindowState[]) {
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
