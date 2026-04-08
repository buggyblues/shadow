/* ─────────────────────────────────────────────────────────────────────────────
 *  Shadow OS — Widget Engine Types
 *
 *  Every Widget is a Micro-App Container that can render anything from simple
 *  DOM to full WebGL scenes. Widgets live on an Infinite Canvas and communicate
 *  with the host through a sandboxed permission API.
 * ───────────────────────────────────────────────────────────────────────────── */

/* ── Geometry ── */

export interface WidgetRect {
  /** X position on the infinite canvas (px, float) */
  x: number
  /** Y position on the infinite canvas (px, float) */
  y: number
  /** Width — 0 means auto-size / borderless */
  w: number
  /** Height — 0 means auto-size / borderless */
  h: number
  /** Stacking order on the canvas */
  z: number
}

/* ── Permissions ── */

/** Capabilities a widget can request from the host runtime. */
export type WidgetPermission =
  | 'fs.read'
  | 'fs.write'
  | 'buddy.post'
  | 'buddy.subscribe'
  | 'store.check'
  | 'store.purchase'
  | 'canvas.background'
  | 'canvas.overlay'
  | 'network.fetch'

/* ── Rendering Mode ── */

export type WidgetRenderMode =
  /** Native React component rendered in-process */
  | 'react'
  /** Sandboxed iframe (HTML / JS / WebGL) */
  | 'iframe'
  /** Sandboxed iframe pointing to a remote URL */
  | 'remote'

/* ── Widget Appearance ── */

export interface WidgetAppearance {
  /** Whether the widget draws its own container chrome */
  borderless: boolean
  /** Background is transparent — allows underlaying canvas to show */
  transparent: boolean
  /** Corner radius override (px). null = theme default 28 */
  radius: number | null
  /** Custom CSS class injected on the wrapper */
  className?: string
}

/* ── Widget Manifest ── */

/** The static description of a widget type, comparable to an app manifest. */
export interface WidgetManifest {
  /** Unique widget type identifier, e.g. "builtin:activity-feed" */
  id: string
  /** Human-readable name (i18n key or literal) */
  name: string
  /** Description shown in the widget picker */
  description?: string
  /** Icon — Lucide icon name or URL */
  icon?: string
  /** Rendering strategy */
  renderMode: WidgetRenderMode
  /** Permissions the widget requires */
  permissions: WidgetPermission[]
  /** Default appearance */
  appearance: WidgetAppearance
  /** Default size when first placed */
  defaultRect: Omit<WidgetRect, 'z'>
  /** If true the widget can span the entire canvas background layer */
  canBeBackground?: boolean
  /** Tags for the widget marketplace / picker filtering */
  tags?: string[]
  /** Tailwind gradient classes for the picker preview card */
  previewGradient?: string
}

/* ── Widget Instance ── */

/** A concrete, placed widget on a server's home canvas. */
export interface WidgetInstance {
  /** Instance UUID */
  instanceId: string
  /** Reference to the manifest id */
  widgetId: string
  /** Per-instance position / size on the canvas */
  rect: WidgetRect
  /** Per-instance appearance overrides */
  appearance: Partial<WidgetAppearance>
  /** Arbitrary config the widget stores (e.g. selected Buddy id, data source) */
  config: Record<string, unknown>
  /** Granted permissions (subset of manifest.permissions) */
  grantedPermissions: WidgetPermission[]
  /** Visibility */
  visible: boolean
  /** For iframe/remote widgets — the resolved source URL */
  sourceUrl?: string
}

/* ── Canvas Layout ── */

export interface CanvasViewport {
  /** Current pan offset X (px) */
  panX: number
  /** Current pan offset Y (px) */
  panY: number
  /** Current zoom level (1 = 100%) */
  zoom: number
}

export interface CanvasLayout {
  /** Current viewport transform */
  viewport: CanvasViewport
  /** Ordered widget instances (render order = array order, z used for overlap) */
  widgets: WidgetInstance[]
  /** Optional background widget instance id */
  backgroundWidgetId: string | null
  /** Grid snap size (0 = free positioning) */
  gridSnap: number
}

/* ── Widget Host API (exposed to sandboxed widgets) ── */

/** The bridge API that widget iframes receive via postMessage. */
export interface WidgetHostAPI {
  /** Read a file from the server workspace */
  'fs.read': (path: string) => Promise<{ content: string; mime: string }>
  /** Write a file to the server workspace */
  'fs.write': (path: string, content: string) => Promise<{ ok: boolean }>
  /** Send a command / message to a Buddy */
  'buddy.post': (buddyId: string, message: string) => Promise<{ ok: boolean }>
  /** Subscribe to Buddy events (returns unsubscribe handle id) */
  'buddy.subscribe': (buddyId: string) => Promise<{ subscriptionId: string }>
  /** Check if the user owns a store item */
  'store.check': (productId: string) => Promise<{ owned: boolean }>
  /** Initiate a purchase flow */
  'store.purchase': (productId: string) => Promise<{ ok: boolean }>
  /** Fetch an external URL (proxied through server) */
  'network.fetch': (url: string, init?: RequestInit) => Promise<{ status: number; body: string }>
}

/* ── Widget Message Protocol ── */

/** Messages FROM the host TO a widget iframe */
export type HostToWidgetMessage =
  | { type: 'widget:init'; instanceId: string; config: Record<string, unknown> }
  | { type: 'widget:config-update'; config: Record<string, unknown> }
  | { type: 'widget:resize'; width: number; height: number }
  | { type: 'widget:api-response'; callId: string; result: unknown; error?: string }
  | { type: 'widget:event'; event: string; payload: unknown }

/** Messages FROM a widget iframe TO the host */
export type WidgetToHostMessage =
  | { type: 'widget:ready'; instanceId: string }
  | { type: 'widget:api-call'; callId: string; method: keyof WidgetHostAPI; args: unknown[] }
  | { type: 'widget:resize-request'; width: number; height: number }
  | { type: 'widget:navigate'; url: string }
  | { type: 'widget:config-save'; config: Record<string, unknown> }
