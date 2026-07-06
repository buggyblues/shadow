import type { WorkspaceNode } from '../../stores/workspace.store'
import { defaultDesktopFilePosition, snapDesktopIconPoint } from './desktop'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsBuiltinAppKey,
  OsDesktopItem,
  OsDesktopWidget,
  ServerAppIntegration,
} from './types'
import { normalizeOsDesktopLayout } from './utils'

export const OS_WIDGET_BASE_Z_INDEX = 10
export const OS_WIDGET_LAYER_STEP = 10
export const OS_WIDGET_MAX_Z_INDEX = 1000

export const OS_BUILTIN_APP_KEYS: readonly OsBuiltinAppKey[] = [
  'workspace',
  'app-store',
  'shop',
  'settings',
  'profile',
  'server-settings',
  'cloud-computers',
  'discover',
  'my-buddies',
  'tasks',
  'wallet',
]

export function desktopWidgetLayerValue(widget: OsDesktopWidget, index: number) {
  return typeof widget.zIndex === 'number' && Number.isFinite(widget.zIndex)
    ? widget.zIndex
    : OS_WIDGET_BASE_Z_INDEX + index * OS_WIDGET_LAYER_STEP
}

export function nextDesktopWidgetZIndex(widgets: OsDesktopWidget[]) {
  const highest = widgets.reduce(
    (value, widget, index) => Math.max(value, desktopWidgetLayerValue(widget, index)),
    OS_WIDGET_BASE_Z_INDEX - OS_WIDGET_LAYER_STEP,
  )
  return Math.min(OS_WIDGET_MAX_Z_INDEX, highest + OS_WIDGET_LAYER_STEP)
}

export function normalizeDesktopWidgetLayers(widgets: OsDesktopWidget[]) {
  const zByWidgetId = new Map(
    widgets
      .map((widget, index) => ({ widget, index }))
      .sort((left, right) => {
        const leftZ = desktopWidgetLayerValue(left.widget, left.index)
        const rightZ = desktopWidgetLayerValue(right.widget, right.index)
        if (leftZ !== rightZ) return leftZ - rightZ
        return left.index - right.index
      })
      .map(
        ({ widget }, index) =>
          [widget.id, OS_WIDGET_BASE_Z_INDEX + index * OS_WIDGET_LAYER_STEP] as const,
      ),
  )

  return widgets.map((widget) => {
    const zIndex = zByWidgetId.get(widget.id) ?? OS_WIDGET_BASE_Z_INDEX
    return widget.zIndex === zIndex ? widget : { ...widget, zIndex }
  })
}

export function workspaceDesktopItemId(nodeId: string) {
  return `workspace:${nodeId}`
}

export function builtinDesktopItemId(key: OsBuiltinAppKey) {
  return `builtin:${key}`
}

export function serverAppDesktopItemId(appKey: string) {
  return `app:${appKey}`
}

export function buddyInboxDesktopItemId(agentId: string) {
  return `buddy-inbox:${agentId}`
}

export function channelDesktopItemId(channelId: string) {
  return `channel:${channelId}`
}

export function desktopWidgetId() {
  return `widget:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36)}`
}

export function flattenWorkspaceNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [node, ...flattenWorkspaceNodes(node.children ?? [])])
}

export function desktopOccupiedPoints(items: OsDesktopItem[], excludeId?: string) {
  return items
    .filter((item) => item.id !== excludeId && item.hidden !== true)
    .map((item) => ({ x: item.x, y: item.y }))
}

export function nextDesktopPoint(
  items: OsDesktopItem[],
  preferred?: { x: number; y: number },
  excludeId?: string,
) {
  return snapDesktopIconPoint(preferred ?? defaultDesktopFilePosition(items.length), {
    occupied: desktopOccupiedPoints(items, excludeId),
  })
}

export function hydrateDesktopLayoutItems(input: {
  layoutItems: ReturnType<typeof normalizeOsDesktopLayout>['items']
  workspaceNodeById: Map<string, WorkspaceNode>
  apps: ServerAppIntegration[]
  channels: ChannelMeta[]
  inboxes: BuddyInboxEntry[]
}) {
  const items = input.layoutItems.flatMap((item): OsDesktopItem[] => {
    if (item.kind === 'workspace-node') {
      const node = input.workspaceNodeById.get(item.workspaceNodeId)
      if (!node) return []
      return [
        {
          id: workspaceDesktopItemId(node.id),
          kind: 'workspace-node',
          node,
          source: item.source,
          hidden: item.hidden,
          x: item.x,
          y: item.y,
        },
      ]
    }
    if (item.kind === 'builtin-app') {
      if (!OS_BUILTIN_APP_KEYS.includes(item.builtinKey)) return []
      return [
        {
          id: builtinDesktopItemId(item.builtinKey),
          kind: 'builtin-app',
          builtinKey: item.builtinKey,
          title: item.title,
          hidden: item.hidden,
          x: item.x,
          y: item.y,
        },
      ]
    }
    if (item.kind === 'buddy-inbox') {
      const inbox = input.inboxes.find((candidate) => candidate.agent.id === item.agentId)
      if (!inbox) return []
      return [
        {
          id: buddyInboxDesktopItemId(inbox.agent.id),
          kind: 'buddy-inbox',
          inbox,
          hidden: item.hidden,
          x: item.x,
          y: item.y,
        },
      ]
    }
    if (item.kind === 'channel') {
      const channel = input.channels.find((candidate) => candidate.id === item.channelId)
      if (!channel || channel.isArchived === true) return []
      return [
        {
          id: channelDesktopItemId(channel.id),
          kind: 'channel',
          channel,
          hidden: item.hidden,
          x: item.x,
          y: item.y,
        },
      ]
    }
    const app = input.apps.find((candidate) => candidate.appKey === item.appKey)
    if (!app) return []
    return [
      {
        id: serverAppDesktopItemId(item.appKey),
        kind: 'server-app',
        appKey: item.appKey,
        appId: item.appId ?? app.id,
        title: app.name,
        iconUrl: app.iconUrl,
        hidden: item.hidden,
        x: item.x,
        y: item.y,
      },
    ]
  })
  const occupied: Array<{ x: number; y: number }> = []

  return items.map((item) => {
    if (item.hidden) return item

    const point = snapDesktopIconPoint(item, { occupied })
    occupied.push(point)
    return point.x === item.x && point.y === item.y ? item : { ...item, ...point }
  })
}
