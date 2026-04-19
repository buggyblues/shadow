// ══════════════════════════════════════════════════════════════
// @shadowob/flash-cards — Plugin Registry
//
// Central registry for card plugins. Manages:
//   1. Plugin registration/unregistration
//   2. Content system chain (priority-sorted, first-match-wins)
//   3. Decorator chain (pre/post, priority-sorted)
//   4. Generic per-kind meta stores
//   5. Per-kind component data (style, icon, shader, render hints)
//   6. Dynamic plugin loading
//
// Thread-safe: all mutations rebuild internal sorted arrays atomically.
// ══════════════════════════════════════════════════════════════

import type {
  CardDecorator,
  CardPlugin,
  ContentSystem,
  DecoratorSystem,
  IconDrawFn,
  PluginChangeCallback,
  PluginRenderDef,
  PluginShaderDef,
  PluginStyleDef,
} from './types'

// ─────────────────────────────────────
// Generic Meta Store
// ─────────────────────────────────────

/** Per-kind meta store — sparse array indexed by EID. */
type MetaStore<T = unknown> = Array<T | undefined>

// ─────────────────────────────────────
// Registry Implementation
// ─────────────────────────────────────

class CardPluginRegistry {
  /** kind → plugin */
  private plugins = new Map<string, CardPlugin>()
  /** All unique plugins (a plugin can handle multiple kinds) */
  private allPlugins = new Set<CardPlugin>()
  /** Sorted content systems (rebuilt on register/unregister) */
  private _contentSystems: ContentSystem[] = []
  /** Pre-decorators sorted by priority */
  private _preDecorators: DecoratorSystem[] = []
  /** Post-decorators sorted by priority */
  private _postDecorators: DecoratorSystem[] = []
  /** Decorator entries (kept for re-sorting) */
  private decoratorEntries: CardDecorator[] = []
  /** Generic meta stores: kind → sparse array */
  private metaStores = new Map<string, MetaStore>()
  /** Raw meta store (always available) */
  private _rawMetaStore: MetaStore<Readonly<Record<string, unknown>>> = []
  /** Change listeners */
  private listeners: PluginChangeCallback[] = []
  /** Dirty flag — content chain needs rebuild */
  private _dirty = false

  // ── Component data tables (populated from plugin.components) ──
  private _styles = new Map<string, PluginStyleDef>()
  private _icons = new Map<string, IconDrawFn>()
  private _shaders = new Map<string, PluginShaderDef>()
  private _renders = new Map<string, PluginRenderDef>()
  /** Auto-incrementing shader kind index */
  private _nextShaderIndex = 0

  // ═══════════════════════════════════════
  // § Plugin Registration
  // ═══════════════════════════════════════

  /**
   * Register a card plugin. If a plugin for the same kind already exists,
   * it is replaced.
   */
  register(plugin: CardPlugin): void {
    const kinds = Array.isArray(plugin.kind) ? plugin.kind : [plugin.kind]
    for (const kind of kinds) {
      this.plugins.set(kind, plugin)
      this._installComponentData(kind, plugin)
    }
    this.allPlugins.add(plugin)
    this._dirty = true
    this.rebuildContentChain()
    for (const cb of this.listeners) cb('register', plugin)
  }

  /** Register multiple plugins at once. */
  registerBulk(plugins: CardPlugin[]): void {
    for (const plugin of plugins) {
      const kinds = Array.isArray(plugin.kind) ? plugin.kind : [plugin.kind]
      for (const kind of kinds) {
        this.plugins.set(kind, plugin)
        this._installComponentData(kind, plugin)
      }
      this.allPlugins.add(plugin)
    }
    this._dirty = true
    this.rebuildContentChain()
  }

  /** Unregister plugin(s) for a kind. */
  unregister(kind: string): void {
    const plugin = this.plugins.get(kind)
    if (!plugin) return
    this.plugins.delete(kind)
    this._removeComponentData(kind)
    // Check if the plugin handles other kinds
    const kinds = Array.isArray(plugin.kind) ? plugin.kind : [plugin.kind]
    const remaining = kinds.filter((k) => this.plugins.get(k) === plugin)
    if (remaining.length === 0) {
      this.allPlugins.delete(plugin)
    }
    this._dirty = true
    this.rebuildContentChain()
    for (const cb of this.listeners) cb('unregister', plugin)
  }

  /** Get plugin for a specific kind. */
  getPlugin(kind: string): CardPlugin | undefined {
    return this.plugins.get(kind)
  }

  /** Get all registered kinds. */
  getRegisteredKinds(): string[] {
    return [...this.plugins.keys()]
  }

  /** Check if a kind has a registered plugin. */
  hasPlugin(kind: string): boolean {
    return this.plugins.has(kind)
  }

  // ═══════════════════════════════════════
  // § Decorators
  // ═══════════════════════════════════════

  /** Register a decorator (pre/post content). */
  registerDecorator(decorator: CardDecorator): void {
    this.decoratorEntries.push(decorator)
    this.rebuildDecoratorChain()
  }

  /** Unregister a decorator by name. */
  unregisterDecorator(name: string): void {
    this.decoratorEntries = this.decoratorEntries.filter((d) => d.name !== name)
    this.rebuildDecoratorChain()
  }

  // ═══════════════════════════════════════
  // § Content System Chain
  // ═══════════════════════════════════════

  /** Get the sorted content system chain. */
  getContentSystems(): ContentSystem[] {
    return this._contentSystems
  }

  /** Get pre-decorators. */
  getPreDecorators(): DecoratorSystem[] {
    return this._preDecorators
  }

  /** Get post-decorators. */
  getPostDecorators(): DecoratorSystem[] {
    return this._postDecorators
  }

  private rebuildContentChain(): void {
    const sorted = [...this.allPlugins].sort((a, b) => (a.priority ?? 500) - (b.priority ?? 500))
    this._contentSystems = sorted.map((p) => p.contentSystem)
    this._dirty = false
  }

  private rebuildDecoratorChain(): void {
    const pre = this.decoratorEntries
      .filter((d) => d.phase === 'pre')
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    const post = this.decoratorEntries
      .filter((d) => d.phase === 'post')
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
    this._preDecorators = pre.map((d) => d.system)
    this._postDecorators = post.map((d) => d.system)
  }

  // ═══════════════════════════════════════
  // § Meta Stores (Generic)
  // ═══════════════════════════════════════

  /**
   * Get typed meta for an entity and kind.
   * Returns undefined if no meta is set.
   */
  getMeta<T = unknown>(eid: number, kind: string): T | undefined {
    const store = this.metaStores.get(kind)
    return store ? (store[eid] as T | undefined) : undefined
  }

  /** Get the raw (untyped) meta for an entity. */
  getRawMeta(eid: number): Readonly<Record<string, unknown>> | undefined {
    return this._rawMetaStore[eid]
  }

  /**
   * Set meta for an entity. Creates the kind store if it doesn't exist.
   */
  setMeta(eid: number, kind: string, meta: unknown): void {
    let store = this.metaStores.get(kind)
    if (!store) {
      store = []
      this.metaStores.set(kind, store)
    }
    store[eid] = meta
  }

  /** Set raw meta for an entity. */
  setRawMeta(eid: number, meta: Readonly<Record<string, unknown>>): void {
    this._rawMetaStore[eid] = meta
  }

  /**
   * Clear all meta stores for an entity (called when repopulating).
   * Only clears stores that have a value set for this EID.
   */
  clearMeta(eid: number): void {
    for (const store of this.metaStores.values()) {
      if (store[eid] !== undefined) store[eid] = undefined
    }
    this._rawMetaStore[eid] = undefined
  }

  /**
   * Populate meta for an entity from a card.
   * Sets both the kind-specific meta and the raw meta.
   */
  populateMeta(eid: number, kind: string, meta: unknown): void {
    this.clearMeta(eid)
    if (meta) {
      this.setMeta(eid, kind, meta)
      this.setRawMeta(eid, (meta || {}) as Readonly<Record<string, unknown>>)
    }
  }

  // ═══════════════════════════════════════
  // § Legacy Meta Store Accessors
  // ═══════════════════════════════════════

  /**
   * Get or create the meta store array for a kind.
   * This allows existing systems to continue using direct array access:
   *   `const store = registry.getMetaStoreArray<MyMeta>('myKind')`
   *   `const meta = store[eid]`
   */
  getMetaStoreArray<T = unknown>(kind: string): Array<T | undefined> {
    let store = this.metaStores.get(kind)
    if (!store) {
      store = []
      this.metaStores.set(kind, store)
    }
    return store as Array<T | undefined>
  }

  /** Get the raw meta store array. */
  getRawMetaStoreArray(): Array<Readonly<Record<string, unknown>> | undefined> {
    return this._rawMetaStore
  }

  // ═══════════════════════════════════════
  // § Component Data (populated from plugins)
  // ═══════════════════════════════════════

  /** Install component data from a plugin for a specific kind. */
  private _installComponentData(kind: string, plugin: CardPlugin): void {
    if (plugin.components?.style) {
      this._styles.set(kind, plugin.components.style)
    }
    if (plugin.components?.icon) {
      this._icons.set(kind, plugin.components.icon)
    }
    if (plugin.components?.shader) {
      this._shaders.set(kind, plugin.components.shader)
    }
    if (plugin.render) {
      this._renders.set(kind, plugin.render)
    }
  }

  /** Remove component data for a kind. */
  private _removeComponentData(kind: string): void {
    this._styles.delete(kind)
    this._icons.delete(kind)
    this._shaders.delete(kind)
    this._renders.delete(kind)
  }

  /** Get style definition for a kind (from plugin). */
  getStyleDef(kind: string): PluginStyleDef | undefined {
    return this._styles.get(kind)
  }

  /** Get icon draw function for a kind (from plugin). */
  getIconDef(kind: string): IconDrawFn | undefined {
    return this._icons.get(kind)
  }

  /** Get shader definition for a kind (from plugin). */
  getShaderDef(kind: string): PluginShaderDef | undefined {
    return this._shaders.get(kind)
  }

  /** Get render hints for a kind (from plugin). */
  getRenderDef(kind: string): PluginRenderDef | undefined {
    return this._renders.get(kind)
  }

  /** Get or assign a stable shader kind index (auto-increment). */
  getShaderKindIndex(kind: string): number {
    // Check if already in the shader map — use insertion order as index
    const existing = [...this._shaders.keys()]
    const idx = existing.indexOf(kind)
    if (idx >= 0) return idx
    return this._nextShaderIndex++
  }

  // ═══════════════════════════════════════
  // § Dynamic Loading
  // ═══════════════════════════════════════

  /**
   * Load a plugin from a URL (ES module with default export of CardPlugin or CardPlugin[]).
   */
  async loadPlugin(url: string): Promise<void> {
    const module = await import(/* @vite-ignore */ url)
    const exported = module.default || module.plugin || module.plugins
    if (Array.isArray(exported)) {
      this.registerBulk(exported)
    } else if (exported && typeof exported === 'object' && 'contentSystem' in exported) {
      this.register(exported as CardPlugin)
    } else {
      throw new Error(`[CardPluginRegistry] Invalid plugin module from ${url}`)
    }
  }

  // ═══════════════════════════════════════
  // § Listeners
  // ═══════════════════════════════════════

  onChange(callback: PluginChangeCallback): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback)
    }
  }

  // ═══════════════════════════════════════
  // § Reset (testing)
  // ═══════════════════════════════════════

  reset(): void {
    this.plugins.clear()
    this.allPlugins.clear()
    this._contentSystems = []
    this._preDecorators = []
    this._postDecorators = []
    this.decoratorEntries = []
    this.metaStores.clear()
    this._rawMetaStore = []
    this.listeners = []
    this._styles.clear()
    this._icons.clear()
    this._shaders.clear()
    this._renders.clear()
    this._nextShaderIndex = 0
  }
}

// ─────────────────────────────────────
// Singleton
// ─────────────────────────────────────

export const registry = new CardPluginRegistry()
export type { CardPluginRegistry }
