// ══════════════════════════════════════════════════════════════
// @shadowob/flash-cards — Card Plugin Types
//
// Defines the contract for card plugins — the unit of extensibility.
// Plugins register content systems, decorators, and meta handling
// for one or more card kinds.
// ══════════════════════════════════════════════════════════════

// ── System function signatures ──

/** A content system renders card-kind-specific content to Canvas2D. Returns true if handled. */
export type ContentSystem = (eid: number) => boolean

/** A decorator system always runs (e.g. header/footer). */
export type DecoratorSystem = (eid: number) => void

/** An icon draw function for Canvas2D. */
export type IconDrawFn = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) => void

// ── Component descriptors ──

/** Style component data — visual identity of a card kind. */
export interface PluginStyleDef {
  accentColor: string
  kindLabel: string
  pip: string
  rank: string
}

/** Shader component data — WebGL/WebGPU visual parameters. */
export interface PluginShaderDef {
  tapeColor: [number, number, number]
}

/** Render hints — how the content pipeline treats this kind. */
export interface PluginRenderDef {
  /** Skip header/footer/bg — card plugin takes over full canvas. */
  fullBleed?: boolean
  /** Custom background color (default '#fdf8f0'). */
  bgColor?: string
}

// ── CardPlugin ──

/**
 * CardPlugin — the atomic unit of card-kind extensibility.
 *
 * Each plugin handles one or more CardKinds. The registry chains content
 * systems by priority (lower = first) and uses first-match-wins semantics.
 *
 * Plugins can optionally provide component definitions (style, icon,
 * shader), render hints, and additional systems.
 *
 * @example
 * ```ts
 * import { registry, type CardPlugin } from '@shadowob/flash-cards'
 *
 * const myPlugin: CardPlugin = {
 *   kind: 'custom-chart',
 *   priority: 50,
 *   contentSystem: (eid) => {
 *     const meta = registry.getMeta<MyChartMeta>(eid, 'custom-chart')
 *     if (!meta) return false
 *     // ... draw on canvas ...
 *     return true
 *   },
 *   components: {
 *     style: { accentColor: '#22d3ee', kindLabel: 'Chart', pip: '▲', rank: '8' },
 *     icon: (ctx, cx, cy, r, color) => { ... },
 *     shader: { tapeColor: [0.133, 0.827, 0.910] },
 *   },
 *   render: { fullBleed: false },
 * }
 * registry.register(myPlugin)
 * ```
 */
export interface CardPlugin {
  /** Card kind(s) this plugin handles. */
  kind: string | string[]

  /** Content system — returns true if the card was rendered. */
  contentSystem: ContentSystem

  /**
   * Priority in the content system chain. Lower = evaluated first.
   * Built-in plugins use 100–999. Use <100 for overrides, >999 for fallbacks.
   * @default 500
   */
  priority?: number

  /** Display name for the plugin (for debugging/admin). */
  name?: string

  /**
   * Component definitions — visual identity data for this card kind.
   * When registered, style/icon/shader data is merged into the global
   * lookup tables so resolveStyle/resolveIcon/resolveShaderStyle
   * work automatically.
   */
  components?: {
    /** Visual style: accent color, label, pip, rank. */
    style?: PluginStyleDef
    /** Icon draw function for the card corner. */
    icon?: IconDrawFn
    /** Shader parameters (tape ribbon color). */
    shader?: PluginShaderDef
  }

  /**
   * Render hints — how the content pipeline treats this kind.
   */
  render?: PluginRenderDef
}

/**
 * CardDecorator — decorators that run for every card (pre/post content).
 *
 * @example
 * ```ts
 * registry.registerDecorator({
 *   name: 'header',
 *   phase: 'pre',
 *   system: headerSystem,
 *   priority: 0,
 * })
 * ```
 */
export interface CardDecorator {
  /** Human-readable name. */
  name: string
  /** Phase: 'pre' runs before content, 'post' runs after content. */
  phase: 'pre' | 'post'
  /** The decorator system function. */
  system: DecoratorSystem
  /** Priority within its phase (lower = first). @default 100 */
  priority?: number
}

/**
 * Callback for when a plugin is registered or unregistered.
 */
export type PluginChangeCallback = (event: 'register' | 'unregister', plugin: CardPlugin) => void
