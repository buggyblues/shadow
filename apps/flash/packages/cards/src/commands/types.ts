// ══════════════════════════════════════════════════════════════
// Card Command System — Types
//
// Commands trigger physics-based animations and actions on cards.
// Each command is dispatched with a target card ID and parameters,
// and the system applies gradual, physics-driven effects.
// ══════════════════════════════════════════════════════════════

export type CommandName =
  | 'move'
  | 'flip'
  | 'rotate'
  | 'orbit'
  | 'trash'
  | 'link'
  | 'toggle'
  | 'highlight'
  | 'focus'
  | 'lock'
  | 'play'
  | 'pause'
  | 'act'
  | 'add'
  | 'scan'
  | 'arena'
  | 'move-to'
  | 'activate'
  | 'help'
  | 'stack'

export interface MoveParams {
  /** Target X in world units */
  x?: number
  /** Target Y in world units */
  y?: number
  /** Move by delta X instead of absolute */
  dx?: number
  /** Move by delta Y instead of absolute */
  dy?: number
  /** Duration in ms (default 600) */
  duration?: number
  /** Easing: 'ease-out' | 'ease-in-out' | 'spring' */
  easing?: 'ease-out' | 'ease-in-out' | 'spring'
}

export interface FlipParams {
  /** Which face: 'front' | 'back' | 'toggle' (default 'toggle') */
  face?: 'front' | 'back' | 'toggle'
}

export interface RotateParams {
  /** Target angle in degrees (absolute) */
  angle?: number
  /** Rotate by delta degrees */
  delta?: number
  /** Duration in ms (default 500) */
  duration?: number
}

export interface OrbitParams {
  /** Center X for orbiting (default: current card x) */
  cx?: number
  /** Center Y for orbiting (default: current card y) */
  cy?: number
  /** Orbit radius (default: distance from card to center) */
  radius?: number
  /** Number of full orbits (default: 3) */
  rounds?: number
  /** Total duration in ms (default: 3000) */
  duration?: number
  /** Start angle offset in degrees (default: 0 = current position) */
  startAngle?: number
  /** Speed variation factor 0-1 (makes orbiting feel irregular, default 0.4) */
  speedVariation?: number
}

export interface TrashParams {
  /** Animation: 'shrink' | 'fall' | 'fade' (default 'shrink') */
  animation?: 'shrink' | 'fall' | 'fade'
}

export interface LinkParams {
  /** Target card ID to link to */
  targetId: string
  /** Rope stiffness 0..1 (default 0.02) */
  stiffness?: number
  /** Rope damping 0..1 (default 0.1) */
  damping?: number
  /** Rope rest length in world units (default auto-calculated) */
  length?: number
}

export interface ToggleParams {
  /** Force visible/hidden, or toggle */
  visible?: boolean
}

export interface HighlightParams {
  /** Highlight color (default '#ffd700') */
  color?: string
  /** Duration in ms (0 = permanent, default 2000) */
  duration?: number
  /** Pulse animation */
  pulse?: boolean
}

export interface FocusParams {
  /** Zoom level (default auto-fit) */
  zoom?: number
  /** Animation duration ms (default 400) */
  duration?: number
}

export interface LockParams {
  /** Lock or unlock (default toggle) */
  locked?: boolean
}

export interface PlayParams {
  /** Loop count (default 1, 0 = infinite) */
  loop?: number
}

export interface PauseParams {}

export interface ActParams {
  /** Action name to trigger */
  action: string
  /** Arbitrary payload */
  payload?: Record<string, unknown>
}

export interface AddParams {
  /** Card kind */
  kind: string
  /** Card title */
  title: string
  /** Position */
  x?: number
  y?: number
}

export interface ScanParams {
  /** Radius in world units (default 300) */
  radius?: number
}

export interface ArenaParams {
  /** Arena kind: 'magic-circle' | 'grid' | 'custom' */
  kind?: 'magic-circle' | 'grid' | 'custom'
  /** World-space center X (default: viewport center) */
  x?: number
  /** World-space center Y (default: viewport center) */
  y?: number
  /** Radius in world units (default 280) */
  radius?: number
  /** Display label */
  label?: string
  /** Accent color */
  color?: string
  /** Custom JS script (custom kind only) */
  script?: string
}

export interface MoveToParams {
  /** Arena ID to move the card into */
  arenaId: string
}

export interface ActivateParams {
  /** Arena ID to activate (uses cardId field for arena ID) */
  arenaId?: string
}

export interface HelpParams {
  /** Command to show help for (optional). Empty = list all. */
  command?: string
}

export interface StackParams {
  /** Card IDs to stack (if empty, use all selected cards) */
  cardIds?: string[]
  /** Horizontal offset per card (default 18) */
  dx?: number
  /** Vertical offset per card (default 8) */
  dy?: number
}

export type CommandParams = {
  move: MoveParams
  flip: FlipParams
  rotate: RotateParams
  orbit: OrbitParams
  trash: TrashParams
  link: LinkParams
  toggle: ToggleParams
  highlight: HighlightParams
  focus: FocusParams
  lock: LockParams
  play: PlayParams
  pause: PauseParams
  act: ActParams
  add: AddParams
  scan: ScanParams
  arena: ArenaParams
  'move-to': MoveToParams
  activate: ActivateParams
  help: HelpParams
  stack: StackParams
}

export interface CardCommand<T extends CommandName = CommandName> {
  /** Command name */
  name: T
  /** Target card ID */
  cardId: string
  /** Command-specific parameters */
  params: CommandParams[T]
  /** Timestamp when dispatched */
  timestamp: number
}

export type CommandResult = {
  success: boolean
  /** For scan command — nearby card IDs + distances */
  data?: unknown
  error?: string
}

export type CommandHandler<T extends CommandName = CommandName> = (
  cmd: CardCommand<T>,
  context: CommandContext,
) => CommandResult

export interface CommandContext {
  /** Physics bodies map */
  bodiesMap: Map<string, import('matter-js').Body>
  /** Physics engine */
  engine: import('matter-js').Engine
  /** Card renderer (for viewport/visual commands) */
  renderer: {
    toggleFlip: (cardId: string) => void
    isCardFlipped: (cardId: string) => boolean
    setHoveredCard: (id: string | null) => void
    centerOnCards: (bodiesMap: Map<string, import('matter-js').Body>, w: number, h: number) => void
    getViewOffset: () => { x: number; y: number }
    getViewZoom: () => number
    setViewOffset: (x: number, y: number) => void
    setViewZoom: (zoom: number) => void
    panBy: (dx: number, dy: number) => void
    zoomAt: (screenX: number, screenY: number, factor: number) => void
  }
  /** Screen dimensions */
  screenW: number
  screenH: number
  /** All cards */
  cards: import('@shadowob/flash-types').Card[]
  /** Animation manager */
  animationManager: {
    markAutoplay: (id: string) => void
    setHoveredCard: (id: string | null) => void
  }
  /** Constraint management for links */
  constraintsMap: Map<string, import('matter-js').Constraint>
  /** Callbacks to parent */
  onCardRemoved?: (cardId: string) => void
  onCardAdded?: (card: import('@shadowob/flash-types').Card) => void
  onScanResult?: (cardId: string, nearby: Array<{ id: string; distance: number }>) => void
}
