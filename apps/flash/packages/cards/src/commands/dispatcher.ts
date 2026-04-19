// ══════════════════════════════════════════════════════════════
// Card Command Dispatcher
//
// Routes commands to handlers and manages active animations.
// Supports gradual physics-driven effects (not instant teleportation).
// ══════════════════════════════════════════════════════════════

import Matter from 'matter-js'
import { CARD_H, CARD_W } from '../constants'
import { activateArena, createArena, moveCardToArena } from '../systems/scene/arenaSystem'
import type {
  ActivateParams,
  ActParams,
  AddParams,
  ArenaParams,
  CardCommand,
  CommandContext,
  CommandName,
  CommandResult,
  FlipParams,
  FocusParams,
  HelpParams,
  HighlightParams,
  LinkParams,
  LockParams,
  MoveParams,
  MoveToParams,
  OrbitParams,
  PauseParams,
  PlayParams,
  RotateParams,
  ScanParams,
  StackParams,
  ToggleParams,
  TrashParams,
} from './types'

// ─────────────────────────────────────
// Active animation tracking
// ─────────────────────────────────────

interface ActiveAnimation {
  cardId: string
  type: 'move' | 'rotate' | 'highlight' | 'focus' | 'trash'
  startTime: number
  duration: number
  /** Tick function called each frame. Returns true when done. */
  tick: (now: number) => boolean
  /** Cleanup when done or cancelled */
  cleanup?: () => void
}

const activeAnimations = new Map<string, ActiveAnimation[]>()

// ─────────────────────────────────────
// Highlight state (glow effects)
// ─────────────────────────────────────

export interface HighlightState {
  color: string
  intensity: number
  pulse: boolean
  startTime: number
  duration: number
}

const highlightStates = new Map<string, HighlightState>()

export function getHighlight(cardId: string): HighlightState | undefined {
  return highlightStates.get(cardId)
}

export function clearHighlight(cardId: string): void {
  highlightStates.delete(cardId)
}

// ─────────────────────────────────────
// Lock state
// ─────────────────────────────────────

const lockedCards = new Set<string>()

export function isLocked(cardId: string): boolean {
  return lockedCards.has(cardId)
}

// ─────────────────────────────────────
// Hidden state (toggle)
// ─────────────────────────────────────

const hiddenByCommand = new Set<string>()

export function isHiddenByCommand(cardId: string): boolean {
  return hiddenByCommand.has(cardId)
}

// ─────────────────────────────────────
// Easing functions
// ─────────────────────────────────────

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function spring(t: number): number {
  const c4 = (2 * Math.PI) / 3
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

function getEasing(name?: string): (t: number) => number {
  switch (name) {
    case 'ease-in-out':
      return easeInOut
    case 'spring':
      return spring
    default:
      return easeOut
  }
}

// ─────────────────────────────────────
// Command Handlers
// ─────────────────────────────────────

function handleMove(cmd: CardCommand<'move'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as MoveParams
  const body = ctx.bodiesMap.get(cardId)
  if (!body) return { success: false, error: 'Card body not found' }
  if (isLocked(cardId)) return { success: false, error: 'Card is locked' }

  const duration = p.duration ?? 600
  const ease = getEasing(p.easing)
  const startX = body.position.x
  const startY = body.position.y

  let targetX: number
  let targetY: number

  if (p.x !== undefined || p.y !== undefined) {
    targetX = p.x ?? startX
    targetY = p.y ?? startY
  } else if (p.dx !== undefined || p.dy !== undefined) {
    targetX = startX + (p.dx ?? 0)
    targetY = startY + (p.dy ?? 0)
  } else {
    return { success: false, error: 'No target position specified' }
  }

  const startTime = performance.now()

  // Cancel existing move animations for this card
  cancelAnimations(cardId, 'move')

  const anim: ActiveAnimation = {
    cardId,
    type: 'move',
    startTime,
    duration,
    tick(now) {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      const et = ease(t)

      const x = startX + (targetX - startX) * et
      const y = startY + (targetY - startY) * et

      Matter.Body.setPosition(body, { x, y })
      Matter.Body.setVelocity(body, { x: 0, y: 0 })

      return t >= 1
    },
  }

  addAnimation(cardId, anim)
  return { success: true }
}

function handleFlip(cmd: CardCommand<'flip'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as FlipParams
  const face = p.face ?? 'toggle'

  if (face === 'toggle') {
    ctx.renderer.toggleFlip(cardId)
  } else if (face === 'front') {
    if (ctx.renderer.isCardFlipped(cardId)) ctx.renderer.toggleFlip(cardId)
  } else if (face === 'back') {
    if (!ctx.renderer.isCardFlipped(cardId)) ctx.renderer.toggleFlip(cardId)
  }

  return { success: true }
}

function handleRotate(cmd: CardCommand<'rotate'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as RotateParams
  const body = ctx.bodiesMap.get(cardId)
  if (!body) return { success: false, error: 'Card body not found' }
  if (isLocked(cardId)) return { success: false, error: 'Card is locked' }

  const duration = p.duration ?? 500
  const startAngle = body.angle
  let targetAngle: number

  if (p.angle !== undefined) {
    targetAngle = (p.angle * Math.PI) / 180
  } else if (p.delta !== undefined) {
    targetAngle = startAngle + (p.delta * Math.PI) / 180
  } else {
    targetAngle = startAngle + Math.PI / 4 // Default: 45°
  }

  const startTime = performance.now()

  cancelAnimations(cardId, 'rotate')

  const anim: ActiveAnimation = {
    cardId,
    type: 'rotate',
    startTime,
    duration,
    tick(now) {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      const et = easeOut(t)
      const angle = startAngle + (targetAngle - startAngle) * et
      Matter.Body.setAngle(body, angle)
      Matter.Body.setAngularVelocity(body, 0)
      return t >= 1
    },
  }

  addAnimation(cardId, anim)
  return { success: true }
}

// ──────────────────────────────────────────────
// Orbit Command — make a card orbit a center point
// for N rounds with varying speed, then stop.
// ──────────────────────────────────────────────
function handleOrbit(cmd: CardCommand<'orbit'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as OrbitParams
  const body = ctx.bodiesMap.get(cardId)
  if (!body) return { success: false, error: 'Card body not found' }
  if (isLocked(cardId)) return { success: false, error: 'Card is locked' }

  const cx = p.cx ?? body.position.x
  const cy = p.cy ?? body.position.y
  const dx0 = body.position.x - cx
  const dy0 = body.position.y - cy
  const radius = p.radius ?? (Math.sqrt(dx0 * dx0 + dy0 * dy0) || 80)
  const rounds = p.rounds ?? 3
  const duration = p.duration ?? 3000
  const speedVariation = p.speedVariation ?? 0.4
  // Start angle from current position (or provided)
  const startAngle =
    p.startAngle !== undefined ? (p.startAngle * Math.PI) / 180 : Math.atan2(dy0, dx0)

  const totalAngle = rounds * 2 * Math.PI
  const startTime = performance.now()

  cancelAnimations(cardId, 'move')
  cancelAnimations(cardId, 'rotate')

  const anim: ActiveAnimation = {
    cardId,
    type: 'move',
    startTime,
    duration,
    tick(now) {
      const elapsed = now - startTime
      const rawT = Math.min(1, elapsed / duration)

      // Non-uniform speed: accelerate then decelerate with some "wobble"
      // Use a combination of ease-in-out and a small sinusoidal variation
      const baseT = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2 // ease-in-out

      // Add subtle speed variation using sine — creates organic spinning feel
      const wobble = speedVariation * Math.sin(rawT * Math.PI * rounds * 2) * 0.03
      const angle = startAngle + (baseT + wobble) * totalAngle

      const nx = cx + Math.cos(angle) * radius
      const ny = cy + Math.sin(angle) * radius
      Matter.Body.setPosition(body, { x: nx, y: ny })
      Matter.Body.setVelocity(body, { x: 0, y: 0 })

      // Also spin the card itself to match its orbital motion
      Matter.Body.setAngle(body, angle + Math.PI / 2)
      Matter.Body.setAngularVelocity(body, 0)

      return rawT >= 1
    },
  }

  addAnimation(cardId, anim)
  return { success: true }
}

function handleTrash(cmd: CardCommand<'trash'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as TrashParams
  const body = ctx.bodiesMap.get(cardId)
  if (!body) return { success: false, error: 'Card body not found' }

  const animation = p.animation ?? 'shrink'
  const duration = 500
  const startTime = performance.now()
  const startX = body.position.x
  const startY = body.position.y

  cancelAnimations(cardId, 'trash')

  const anim: ActiveAnimation = {
    cardId,
    type: 'trash',
    startTime,
    duration,
    tick(now) {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)

      if (animation === 'fall') {
        // Fall off screen
        Matter.Body.setPosition(body, { x: startX, y: startY + t * t * 2000 })
      } else if (animation === 'fade') {
        // Shrink slightly while fading (handled by highlight)
        const scale = 1 - t * 0.3
        Matter.Body.scale(
          body,
          scale / (1 - (t - 0.01 > 0 ? t - 0.01 : 0) * 0.3),
          scale / (1 - (t - 0.01 > 0 ? t - 0.01 : 0) * 0.3),
        )
      } else {
        // Shrink: spin and shrink
        Matter.Body.setAngle(body, body.angle + 0.15)
        const s = 1 - easeOut(t) * 0.8
        Matter.Body.scale(body, s / (s + 0.01), s / (s + 0.01))
      }

      if (t >= 1) {
        ctx.onCardRemoved?.(cardId)
        return true
      }
      return false
    },
  }

  addAnimation(cardId, anim)
  return { success: true }
}

function handleLink(cmd: CardCommand<'link'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as LinkParams
  const bodyA = ctx.bodiesMap.get(cardId)
  const bodyB = ctx.bodiesMap.get(p.targetId)
  if (!bodyA || !bodyB) return { success: false, error: 'One or both card bodies not found' }

  const constraintKey = [cardId, p.targetId].sort().join('::')

  // If already linked, remove the link
  if (ctx.constraintsMap.has(constraintKey)) {
    const existing = ctx.constraintsMap.get(constraintKey)!
    Matter.World.remove(ctx.engine.world, existing)
    ctx.constraintsMap.delete(constraintKey)
    return { success: true, data: { action: 'unlinked' } }
  }

  // Fixed rest length: use explicit param or a constant 1.5× card width.
  // Do NOT base on current distance — that would give wildly different tensions
  // depending on where the cards happen to be when /link is issued.
  const restLength = p.length ?? CARD_W * 1.5

  const constraint = Matter.Constraint.create({
    bodyA,
    bodyB,
    stiffness: p.stiffness ?? 0.02,
    damping: p.damping ?? 0.1,
    length: restLength,
    render: { visible: true, lineWidth: 2 },
  })

  Matter.World.add(ctx.engine.world, constraint)
  ctx.constraintsMap.set(constraintKey, constraint)

  return { success: true, data: { action: 'linked', constraintKey } }
}

function handleToggle(cmd: CardCommand<'toggle'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as ToggleParams

  if (p.visible === true) {
    hiddenByCommand.delete(cardId)
  } else if (p.visible === false) {
    hiddenByCommand.add(cardId)
  } else {
    // toggle
    if (hiddenByCommand.has(cardId)) hiddenByCommand.delete(cardId)
    else hiddenByCommand.add(cardId)
  }

  return { success: true, data: { hidden: hiddenByCommand.has(cardId) } }
}

function handleHighlight(cmd: CardCommand<'highlight'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as HighlightParams
  const color = p.color ?? '#ffd700'
  const duration = p.duration ?? 2000
  const pulse = p.pulse ?? true
  const startTime = performance.now()

  highlightStates.set(cardId, {
    color,
    intensity: 1,
    pulse,
    startTime,
    duration,
  })

  if (duration > 0) {
    cancelAnimations(cardId, 'highlight')
    const anim: ActiveAnimation = {
      cardId,
      type: 'highlight',
      startTime,
      duration,
      tick(now) {
        const elapsed = now - startTime
        const t = Math.min(1, elapsed / duration)

        const state = highlightStates.get(cardId)
        if (state) {
          if (pulse) {
            state.intensity = 0.5 + 0.5 * Math.sin(elapsed * 0.008)
          }
          // Fade out in last 30%
          if (t > 0.7) {
            state.intensity *= 1 - (t - 0.7) / 0.3
          }
        }

        if (t >= 1) {
          highlightStates.delete(cardId)
          return true
        }
        return false
      },
    }
    addAnimation(cardId, anim)
  }

  return { success: true }
}

function handleFocus(cmd: CardCommand<'focus'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as FocusParams
  const body = ctx.bodiesMap.get(cardId)
  if (!body) return { success: false, error: 'Card body not found' }

  const targetX = body.position.x
  const targetY = body.position.y
  const targetZoom = p.zoom ?? 1.2
  const duration = p.duration ?? 400

  const startOffset = ctx.renderer.getViewOffset()
  const startZoom = ctx.renderer.getViewZoom()

  // Target: center card on screen
  const targetOffsetX = targetX - ctx.screenW / (2 * targetZoom)
  const targetOffsetY = targetY - ctx.screenH / (2 * targetZoom)

  const startTime = performance.now()

  cancelAnimations(cardId, 'focus')

  const anim: ActiveAnimation = {
    cardId,
    type: 'focus',
    startTime,
    duration,
    tick(now) {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      const et = easeInOut(t)

      const ox = startOffset.x + (targetOffsetX - startOffset.x) * et
      const oy = startOffset.y + (targetOffsetY - startOffset.y) * et
      const z = startZoom + (targetZoom - startZoom) * et

      ctx.renderer.setViewOffset(ox, oy)
      ctx.renderer.setViewZoom(z)

      return t >= 1
    },
  }

  addAnimation(cardId, anim)

  // Also highlight briefly
  handleHighlight(
    {
      name: 'highlight',
      cardId,
      params: { color: '#4fc3f7', duration: 1500, pulse: true },
      timestamp: cmd.timestamp,
    },
    ctx,
  )

  return { success: true }
}

function handleLock(cmd: CardCommand<'lock'>, _ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as LockParams

  if (p.locked === true) {
    lockedCards.add(cardId)
  } else if (p.locked === false) {
    lockedCards.delete(cardId)
  } else {
    if (lockedCards.has(cardId)) lockedCards.delete(cardId)
    else lockedCards.add(cardId)
  }

  const body = _ctx.bodiesMap.get(cardId)
  if (body) {
    Matter.Body.setStatic(body, lockedCards.has(cardId))
  }

  return { success: true, data: { locked: lockedCards.has(cardId) } }
}

function handlePlay(cmd: CardCommand<'play'>, ctx: CommandContext): CommandResult {
  const { cardId } = cmd
  ctx.animationManager.markAutoplay(cardId)
  ctx.animationManager.setHoveredCard(cardId)
  return { success: true }
}

function handlePause(cmd: CardCommand<'pause'>, ctx: CommandContext): CommandResult {
  const { cardId } = cmd
  // Remove from autoplay by setting hover to null
  ctx.animationManager.setHoveredCard(null)
  return { success: true }
}

function handleAct(cmd: CardCommand<'act'>, _ctx: CommandContext): CommandResult {
  // Extensible action system — currently logs and returns
  return { success: true, data: { action: (cmd.params as ActParams).action, triggered: true } }
}

function handleAdd(cmd: CardCommand<'add'>, ctx: CommandContext): CommandResult {
  const p = cmd.params as AddParams
  const card: import('@shadowob/flash-types').Card = {
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: p.kind as any,
    title: p.title,
    content: '',
    sourceId: null,
    linkedCardIds: [],
    meta: {},
    tags: [],
    priority: 'medium',
    autoGenerated: false,
    rating: 0,
    deckIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  ctx.onCardAdded?.(card)
  return { success: true, data: { cardId: card.id } }
}

function handleScan(cmd: CardCommand<'scan'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as ScanParams
  const radius = p.radius ?? 300
  const body = ctx.bodiesMap.get(cardId)
  if (!body) return { success: false, error: 'Card body not found' }

  const nearby: Array<{ id: string; distance: number; angle: number }> = []

  for (const [id, otherBody] of ctx.bodiesMap) {
    if (id === cardId) continue
    const dx = otherBody.position.x - body.position.x
    const dy = otherBody.position.y - body.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= radius) {
      nearby.push({
        id,
        distance: Math.round(dist),
        angle: Math.round((Math.atan2(dy, dx) * 180) / Math.PI),
      })
    }
  }

  nearby.sort((a, b) => a.distance - b.distance)

  // Highlight scanned cards
  for (const n of nearby) {
    handleHighlight(
      {
        name: 'highlight',
        cardId: n.id,
        params: { color: '#4fc3f7', duration: 1500, pulse: false },
        timestamp: cmd.timestamp,
      },
      ctx,
    )
  }

  // Highlight the scanning card
  handleHighlight(
    {
      name: 'highlight',
      cardId,
      params: { color: '#ffd700', duration: 1500, pulse: true },
      timestamp: cmd.timestamp,
    },
    ctx,
  )

  ctx.onScanResult?.(cardId, nearby)

  return { success: true, data: { nearby } }
}

// ─────────────────────────────────────
// Stack Command
// ─────────────────────────────────────

function handleStack(cmd: CardCommand<'stack'>, ctx: CommandContext): CommandResult {
  const p = cmd.params as StackParams
  const dx = p.dx ?? 18
  const dy = p.dy ?? 8

  // Collect card IDs: explicit list only — no implicit "all cards"
  const ids: string[] = p.cardIds && p.cardIds.length > 0 ? p.cardIds : []

  if (ids.length === 0)
    return {
      success: false,
      error: 'Please specify card IDs to stack, e.g.: /stack card-1 card-2 card-3',
    }
  if (ids.length === 1) return { success: false, error: 'At least two cards are required to stack' }

  // Anchor position = current position of first card
  const firstBody = ctx.bodiesMap.get(ids[0])
  if (!firstBody) return { success: false, error: `Card body not found: ${ids[0]}` }
  const baseX = firstBody.position.x
  const baseY = firstBody.position.y

  const dispatch = (name: string, cardId: string, dparams: Record<string, unknown>) => {
    dispatchCommand(
      { name: name as CommandName, cardId, params: dparams as any, timestamp: Date.now() },
      ctx,
    )
  }

  ids.forEach((id, i) => {
    dispatch('move', id, {
      x: baseX + dx * i,
      y: baseY + dy * i,
      duration: 400,
      easing: 'spring',
    })
  })

  return { success: true, data: { stacked: ids.length, dx, dy } }
}

// ─────────────────────────────────────
// Help System
// ─────────────────────────────────────

const HELP_DOCS: Record<string, { usage: string; description: string; params?: string[] }> = {
  move: {
    usage:
      '/move <cardId> [x=N] [y=N] [dx=N] [dy=N] [duration=600] [easing=spring|ease-out|ease-in-out]',
    description: 'Move a card to the specified world coordinates or offset.',
    params: [
      'x/y — absolute target coordinates',
      'dx/dy — relative offset',
      'duration — animation duration ms',
      'easing — easing function: spring / ease-out / ease-in-out',
    ],
  },
  flip: {
    usage: '/flip <cardId> [face=toggle|front|back]',
    description: 'Flip a card to show its front or back face.',
    params: ['face=toggle (default) / front / back'],
  },
  rotate: {
    usage: '/rotate <cardId> [angle=N] [delta=N] [duration=500]',
    description: 'Rotate a card (degrees).',
    params: [
      'angle — absolute angle',
      'delta — relative rotation amount',
      'duration — animation duration ms',
    ],
  },
  orbit: {
    usage: '/orbit <cardId> [cx=N] [cy=N] [radius=N] [rounds=3] [duration=3000]',
    description: 'Make a card orbit a center point for N rounds with varying speed, then stop.',
    params: [
      'cx/cy — center coordinates (default: current position)',
      'radius — orbit radius',
      'rounds — number of rounds (default 3)',
      'duration — total duration ms (default 3000)',
    ],
  },
  trash: {
    usage: '/trash <cardId> [animation=shrink|fall|fade]',
    description: 'Delete a card (with animation).',
    params: ['animation — shrink (default) / fall / fade'],
  },
  link: {
    usage: '/link <cardId> <targetId> [stiffness=0.02] [damping=0.1] [length=N]',
    description: 'Connect two cards with a rope, creating a physics constraint.',
    params: [
      'targetId — target card ID',
      'stiffness — rope stiffness 0-1',
      'damping — damping 0-1',
      'length — rest length (default: auto)',
    ],
  },
  toggle: {
    usage: '/toggle <cardId> [visible=true|false]',
    description: 'Show/hide a card.',
    params: ['visible=true/false; omit to toggle'],
  },
  highlight: {
    usage: '/highlight <cardId> [color=#hex] [duration=2000] [pulse=true|false]',
    description: 'Highlight a card with a glow effect.',
    params: [
      'color — hex color',
      'duration — duration ms (0=permanent)',
      'pulse — whether to pulse',
    ],
  },
  focus: {
    usage: '/focus <cardId> [zoom=1.2] [duration=400]',
    description: 'Pan the viewport to focus on the specified card.',
    params: ['zoom — zoom level', 'duration — transition duration'],
  },
  lock: {
    usage: '/lock <cardId> [locked=true|false]',
    description: 'Lock/unlock a card; locked cards cannot be moved by physics or commands.',
    params: ['locked=true/false; omit to toggle'],
  },
  play: {
    usage: '/play <cardId> [loop=1]',
    description: 'Play the embedded animation on a card (Lottie/GIF/Live2D).',
    params: ['loop — repeat count (0=infinite)'],
  },
  pause: {
    usage: '/pause <cardId>',
    description: 'Pause the embedded animation on a card.',
    params: [],
  },
  act: {
    usage: '/act <cardId> action=<name> [payload.*=...]',
    description: 'Trigger a custom action on a card.',
    params: ['action — action name', 'payload — arbitrary key-value pairs'],
  },
  add: {
    usage: '/add kind=<kind> title=<text> [x=N] [y=N]',
    description: 'Create a new card at the specified position.',
    params: [
      'kind — card type (quote/text/idea/...)',
      'title — card title',
      'x/y — world coordinates (default: viewport center)',
    ],
  },
  scan: {
    usage: '/scan <cardId> [radius=300]',
    description: 'Scan for cards near the target card, highlight them and return their IDs.',
    params: ['radius — scan radius (world units)'],
  },
  arena: {
    usage: '/arena [magic-circle|grid|custom] [x=N] [y=N] [radius=280] [label=text]',
    description: 'Create a magic arena in the current viewport.',
    params: [
      'magic-circle|grid|custom — type',
      'x/y — center coordinates',
      'radius — radius',
      'label — display name',
    ],
  },
  'move-to': {
    usage: '/move-to <cardId> <arenaId>',
    description: 'Move the specified card into a magic arena.',
    params: ['cardId — target card ID', 'arenaId — target arena ID'],
  },
  activate: {
    usage: '/activate <arenaId>',
    description:
      'Activate a magic arena, running its built-in or custom script (shuffle/grid layout, etc.).',
    params: ['arenaId — arena ID'],
  },
  help: {
    usage: '/help [command]',
    description: 'Show all available commands, or detailed help for a specific command.',
    params: ['command — optional command name (without /)'],
  },
  stack: {
    usage: '/stack [cardId...] [dx=18] [dy=8]',
    description:
      'Stack multiple cards into a fan layout. Specify multiple IDs separated by spaces.',
    params: [
      'cardIds — optional space-separated card IDs',
      'dx — horizontal offset per card (default 18)',
      'dy — vertical offset per card (default 8)',
    ],
  },
}

function handleHelp(cmd: CardCommand<'help'>, _ctx: CommandContext): CommandResult {
  const p = cmd.params as HelpParams
  const target = p.command?.toLowerCase().replace(/^\//, '')

  if (target && HELP_DOCS[target]) {
    const doc = HELP_DOCS[target]
    const lines = [
      `📖 /${target}`,
      `Usage: ${doc.usage}`,
      `Description: ${doc.description}`,
      ...(doc.params && doc.params.length > 0
        ? ['Parameters:', ...doc.params.map((p) => `  • ${p}`)]
        : []),
    ]
    return { success: true, data: { text: lines.join('\n') } }
  }

  if (target) {
    return { success: false, error: `Unknown command: /${target}. Type /help to see all commands.` }
  }

  // List all commands
  const lines = [
    '📋 Available commands (type /help <command> for details):',
    '',
    'Card actions:',
    '  /flip /rotate /move /trash /link /toggle /highlight /focus /lock',
    '  /play /pause /act /add /scan /stack',
    '',
    'Arenas:',
    '  /arena — create an arena',
    '  /move-to — move a card into an arena',
    '  /activate — activate an arena',
    '',
    'Other:',
    '  /help [command] — show help',
  ]
  return { success: true, data: { text: lines.join('\n') } }
}

// ─────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────

const handlers: Record<CommandName, (cmd: CardCommand<any>, ctx: CommandContext) => CommandResult> =
  {
    move: handleMove,
    flip: handleFlip,
    rotate: handleRotate,
    orbit: handleOrbit,
    trash: handleTrash,
    link: handleLink,
    toggle: handleToggle,
    highlight: handleHighlight,
    focus: handleFocus,
    lock: handleLock,
    play: handlePlay,
    pause: handlePause,
    act: handleAct,
    add: handleAdd,
    scan: handleScan,
    arena: handleArena,
    'move-to': handleMoveTo,
    activate: handleActivate,
    help: handleHelp,
    stack: handleStack,
  }

// ─────────────────────────────────────
// Arena Command Handlers
// ─────────────────────────────────────

function handleArena(cmd: CardCommand<'arena'>, ctx: CommandContext): CommandResult {
  const p = cmd.params as ArenaParams

  // Compute default center (viewport center)
  const vp = ctx.renderer.getViewOffset()
  const z = ctx.renderer.getViewZoom() || 1
  const defaultX = vp.x + ctx.screenW / (2 * z)
  const defaultY = vp.y + ctx.screenH / (2 * z)

  const arena = createArena({
    kind: p.kind ?? 'magic-circle',
    x: p.x ?? defaultX,
    y: p.y ?? defaultY,
    radius: p.radius ?? 280,
    label: p.label,
    color: p.color,
    script: p.script,
  })

  return { success: true, data: { arenaId: arena.id, label: arena.label } }
}

function handleMoveTo(cmd: CardCommand<'move-to'>, ctx: CommandContext): CommandResult {
  const { cardId, params } = cmd
  const p = params as MoveToParams

  const dispatch = (name: string, cid: string, dparams: Record<string, unknown>) => {
    dispatchCommand(
      { name: name as CommandName, cardId: cid, params: dparams as any, timestamp: Date.now() },
      ctx,
    )
  }

  return moveCardToArena(cardId, p.arenaId, dispatch)
}

function handleActivate(cmd: CardCommand<'activate'>, ctx: CommandContext): CommandResult {
  const p = cmd.params as ActivateParams
  const arenaId = p.arenaId ?? cmd.cardId

  const dispatch = (name: string, cardId: string, dparams: Record<string, unknown>) => {
    dispatchCommand(
      { name: name as CommandName, cardId, params: dparams as any, timestamp: Date.now() },
      ctx,
    )
  }

  return activateArena(arenaId, ctx.bodiesMap, ctx.cards, dispatch)
}

export function dispatchCommand<T extends CommandName>(
  cmd: CardCommand<T>,
  ctx: CommandContext,
): CommandResult {
  const handler = handlers[cmd.name]
  if (!handler) return { success: false, error: `Unknown command: ${cmd.name}` }
  return handler(cmd, ctx)
}

// ─────────────────────────────────────
// Animation management
// ─────────────────────────────────────

function addAnimation(cardId: string, anim: ActiveAnimation): void {
  const list = activeAnimations.get(cardId) || []
  list.push(anim)
  activeAnimations.set(cardId, list)
}

function cancelAnimations(cardId: string, type?: string): void {
  const list = activeAnimations.get(cardId)
  if (!list) return
  const remaining = list.filter((a) => {
    if (!type || a.type === type) {
      a.cleanup?.()
      return false
    }
    return true
  })
  if (remaining.length === 0) activeAnimations.delete(cardId)
  else activeAnimations.set(cardId, remaining)
}

/**
 * Tick all active animations. Call once per frame from the render loop.
 * Returns true if any animations were ticked (for dirty checking).
 */
export function tickCommands(now: number): boolean {
  if (activeAnimations.size === 0) return false

  let anyActive = false

  for (const [cardId, list] of activeAnimations) {
    const remaining = list.filter((anim) => {
      const done = anim.tick(now)
      if (done) {
        anim.cleanup?.()
        return false
      }
      return true
    })

    if (remaining.length === 0) {
      activeAnimations.delete(cardId)
    } else {
      activeAnimations.set(cardId, remaining)
      anyActive = true
    }
  }

  return anyActive || activeAnimations.size > 0
}

/**
 * Parse a text command string like "/move card1 x=100 y=200"
 * into a CardCommand object.
 */
export function parseCommand(
  text: string,
  cards: import('@shadowob/flash-types').Card[],
): CardCommand | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  const parts = trimmed.split(/\s+/)
  const cmdName = parts[0].slice(1).toLowerCase() as CommandName

  if (!handlers[cmdName]) return null

  // ── Arena-specific commands (no card target) ────────────────
  if (cmdName === 'arena') {
    // /arena [kind] [x=N] [y=N] [radius=N] [label=text]
    // optional positional: kind as bare word
    const params: Record<string, unknown> = {}
    const kinds = ['magic-circle', 'grid', 'custom']
    let i = 1
    if (i < parts.length && kinds.includes(parts[i])) {
      params.kind = parts[i++]
    }
    for (; i < parts.length; i++) {
      const eq = parts[i].indexOf('=')
      if (eq > 0) {
        const key = parts[i].slice(0, eq)
        const val = parts[i].slice(eq + 1)
        const num = parseFloat(val)
        params[key] = isNaN(num) ? val : num
      }
    }
    return { name: cmdName, cardId: '__arena__', params: params as any, timestamp: Date.now() }
  }

  if (cmdName === 'activate') {
    // /activate <arenaId>
    const arenaId = parts[1] ?? ''
    return { name: cmdName, cardId: arenaId, params: { arenaId } as any, timestamp: Date.now() }
  }

  if (cmdName === 'stack') {
    // /stack [cardId ...] [dx=N] [dy=N]
    // bare args before key=value are card IDs or title fragments; key=value are params
    const stackParams: Record<string, unknown> = {}
    const cardIds: string[] = []
    for (let i = 1; i < parts.length; i++) {
      const token = parts[i]
      if (token.includes('=')) {
        const eq = token.indexOf('=')
        const k = token.slice(0, eq)
        const v = token.slice(eq + 1)
        const num = parseFloat(v)
        stackParams[k] = isNaN(num) ? v : num
      } else {
        // try as card ID or title
        const match = cards.find(
          (c) => c.id === token || c.title.toLowerCase().includes(token.toLowerCase()),
        )
        if (match) cardIds.push(match.id)
      }
    }
    if (cardIds.length > 0) stackParams.cardIds = cardIds
    return {
      name: cmdName,
      cardId: cardIds[0] ?? '__stack__',
      params: stackParams as any,
      timestamp: Date.now(),
    }
  }

  if (cmdName === 'help') {
    // /help [command]
    const command = parts[1]?.replace(/^\//, '') ?? ''
    return {
      name: cmdName,
      cardId: '__help__',
      params: { command: command || undefined } as any,
      timestamp: Date.now(),
    }
  }

  // ── Standard commands with card target ─────────────────────

  // Find card target: second arg might be a card ID, index, or title fragment
  let cardId = ''
  let paramStart = 1

  if (parts.length > 1) {
    // Try exact card ID match
    const candidate = parts[1]
    const byId = cards.find((c) => c.id === candidate)
    if (byId) {
      cardId = byId.id
      paramStart = 2
    } else {
      // Try numeric index
      const idx = parseInt(candidate, 10)
      if (!isNaN(idx) && idx >= 0 && idx < cards.length) {
        cardId = cards[idx].id
        paramStart = 2
      } else {
        // Try title match
        const byTitle = cards.find((c) => c.title.toLowerCase().includes(candidate.toLowerCase()))
        if (byTitle) {
          cardId = byTitle.id
          paramStart = 2
        }
      }
    }
  }

  // If no card found and command requires one, use first card
  if (!cardId && cmdName !== 'add') {
    if (cards.length > 0) cardId = cards[0].id
    else return null
  }

  // Parse key=value params
  const params: Record<string, unknown> = {}
  for (let i = paramStart; i < parts.length; i++) {
    const [key, val] = parts[i].split('=')
    if (key && val !== undefined) {
      // Try numeric
      const num = parseFloat(val)
      if (!isNaN(num)) params[key] = num
      else if (val === 'true') params[key] = true
      else if (val === 'false') params[key] = false
      else params[key] = val
    } else if (key) {
      // For link command, bare second arg is targetId
      if (cmdName === 'link' && i === paramStart) {
        const targetCard = cards.find(
          (c) => c.id === key || c.title.toLowerCase().includes(key.toLowerCase()),
        )
        if (targetCard) params.targetId = targetCard.id
      }
      // For move-to, bare second arg is arenaId
      if (cmdName === 'move-to' && i === paramStart) {
        params.arenaId = key
      }
      // For flip, bare '0' = front, '1' = back, 'front'/'back'/'toggle' as bare words
      if (cmdName === 'flip') {
        if (key === '0') params.face = 'front'
        else if (key === '1') params.face = 'back'
        else if (key === 'front' || key === 'back' || key === 'toggle') params.face = key
      }
    }
  }

  return {
    name: cmdName,
    cardId,
    params: params as any,
    timestamp: Date.now(),
  }
}

/** Check if any command animations are active */
export function hasActiveAnimations(): boolean {
  return activeAnimations.size > 0
}

/** Cancel all running command animations */
export function cancelAllAnimations(): void {
  for (const [cardId] of activeAnimations) {
    cancelAnimations(cardId)
  }
}
