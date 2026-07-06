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
import type { LaunchContext, OsWindowState, ServerAppIntegration } from '../types'
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

export function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function absoluteHostUrl(value?: string | null) {
  if (!value) return value ?? null
  try {
    return new URL(value, window.location.origin).toString()
  } catch {
    return value
  }
}

export function normalizeBridgeInbox(inbox: ShadowBuddyInboxSummary): ShadowBuddyInboxSummary {
  const user = inbox.agent.user
  if (!user) return inbox
  return {
    ...inbox,
    agent: {
      ...inbox.agent,
      user: {
        ...user,
        avatarUrl: absoluteHostUrl(user.avatarUrl) ?? undefined,
      },
    },
  }
}

export type OsBridgeBuddyCreatorLanding = {
  title?: string
  description?: string
}

export type OsBridgeBuddyCreatorResult = {
  opened: boolean
  agent?: unknown
}

export function normalizeBuddyCreatorLanding(
  value: unknown,
): OsBridgeBuddyCreatorLanding | undefined {
  const landing = getRecord(value)
  if (!landing) return undefined
  const title = typeof landing.title === 'string' ? landing.title : undefined
  const description = typeof landing.description === 'string' ? landing.description : undefined
  return title || description ? { title, description } : undefined
}

export function normalizeOsServerAppRoutePath(value: unknown) {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (!input) return null
  const withoutHash = input.startsWith('#') ? input.slice(1) : input
  const prefixed = withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`
  return prefixed.replace(/\/{2,}/g, '/') || '/'
}

export function routeRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}:${Math.random()}`
}

export function osAppRouteState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const route = (value as { shadowOsAppRoute?: unknown }).shadowOsAppRoute
  if (!route || typeof route !== 'object' || Array.isArray(route)) return null
  const record = route as { appKey?: unknown; path?: unknown; windowId?: unknown }
  if (
    typeof record.appKey !== 'string' ||
    typeof record.path !== 'string' ||
    typeof record.windowId !== 'string'
  ) {
    return null
  }
  return {
    appKey: record.appKey,
    path: normalizeOsServerAppRoutePath(record.path) ?? '/',
    windowId: record.windowId,
  }
}

export function pushOsAppRouteHistory(windowId: string, appKey: string, path: string) {
  if (typeof window === 'undefined') return
  const currentState =
    window.history.state &&
    typeof window.history.state === 'object' &&
    !Array.isArray(window.history.state)
      ? window.history.state
      : {}
  window.history.pushState(
    {
      ...currentState,
      shadowOsAppRoute: { windowId, appKey, path },
    },
    '',
    window.location.href,
  )
}
