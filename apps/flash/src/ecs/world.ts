// ══════════════════════════════════════════════════════════════
// ECS World — bitECS-based two-tier architecture
//
// 1. ContentPipeline  — ephemeral, per-card, draws card texture
//    Uses CONTENT_EID (a single reused entity in contentWorld)
//
// 2. SceneWorld       — persistent bitECS entities across frames
//    (transform, interaction, flip, visibility)
// ══════════════════════════════════════════════════════════════

import { addComponent, addEntity, removeEntity } from 'bitecs'
import type { Card } from '../types'
import {
  allSceneEids,
  CONTENT_EID,
  contentWorld,
  createSceneEntity,
  destroySceneEntity,
  getCardEid,
  getEidCardId,
  sceneWorld,
} from './component'
import {
  CFlip,
  CInteraction,
  CRenderOrder,
  CShaderStyle,
  CTransform,
  CVisibility,
} from './components'
import { CCanvas, canvasStore } from './components/canvasComponent'
import { CCardData, cardDataStore } from './components/cardDataComponent'
import { createFlip, Flip } from './components/flipComponent'
import { CIcon, iconStore, resolveIcon } from './components/iconComponent'
import { Interaction } from './components/interactionComponent'
import { CLayout, createLayout, layoutStore } from './components/layoutComponent'
import {
  argumentMetaStore,
  CArgumentMeta,
  CChartMeta,
  CCodeMeta,
  CColorMeta,
  CCommentMeta,
  CComparisonMeta,
  CCountdownMeta,
  CDataMeta,
  CDefinitionMeta,
  CEventMeta,
  CExampleMeta,
  CFileMeta,
  CGifMeta,
  CImageMeta,
  CInspirationMeta,
  CKeypointMeta,
  CLinkMeta,
  CLive2DMeta,
  CLottieMeta,
  CMathMeta,
  CPersonMeta,
  CPokerMeta,
  CPositionMeta,
  CProcessMeta,
  CQrcodeMeta,
  CQuoteMeta,
  CRawMeta,
  CReferenceMeta,
  CSocialMeta,
  CStoryMeta,
  CSummaryMeta,
  CTableMeta,
  CTarotMeta,
  CTerminalMeta,
  CThreeDMeta,
  CTimelineMeta,
  CTimestampMeta,
  CTodoMeta,
  CVoiceMeta,
  CWebpageMeta,
  chartMetaStore,
  codeMetaStore,
  colorMetaStore,
  commentMetaStore,
  comparisonMetaStore,
  countdownMetaStore,
  dataMetaStore,
  definitionMetaStore,
  eventMetaStore,
  exampleMetaStore,
  fileMetaStore,
  gifMetaStore,
  imageMetaStore,
  inspirationMetaStore,
  keypointMetaStore,
  linkMetaStore,
  live2dMetaStore,
  lottieMetaStore,
  mathMetaStore,
  personMetaStore,
  pokerMetaStore,
  positionMetaStore,
  processMetaStore,
  qrcodeMetaStore,
  quoteMetaStore,
  rawMetaStore,
  referenceMetaStore,
  socialMetaStore,
  storyMetaStore,
  summaryMetaStore,
  tableMetaStore,
  tarotMetaStore,
  terminalMetaStore,
  threeDMetaStore,
  timelineMetaStore,
  timestampMetaStore,
  todoMetaStore,
  voiceMetaStore,
  webpageMetaStore,
} from './components/metaComponent'
import { RenderOrder } from './components/renderOrderComponent'
import { resolveShaderStyle, shaderStyleStore } from './components/shaderStyleComponent'
import { CStyle, resolveStyle, styleStore } from './components/styleComponent'
import { Transform } from './components/transformComponent'
import { Visibility } from './components/visibilityComponent'

// Re-export worlds so systems can import them
export { CONTENT_EID, contentWorld, sceneWorld } from './component'

// ═══════════════════════════════════════
// § 1. Content Pipeline (texture rendering)
// ═══════════════════════════════════════

/** A System that processes the CONTENT_EID entity (returns true if handled) */
export type ContentSystem = (eid: number) => boolean

/** A decorator that always runs (header, footer). */
export type DecoratorSystem = (eid: number) => void

const preDecorators: DecoratorSystem[] = []
const contentSystems: ContentSystem[] = []
const postDecorators: DecoratorSystem[] = []

export function registerPreDecorator(sys: DecoratorSystem) {
  preDecorators.push(sys)
}
export function registerContentSystem(sys: ContentSystem) {
  contentSystems.push(sys)
}
export function registerPostDecorator(sys: DecoratorSystem) {
  postDecorators.push(sys)
}

/** Populate content component stores for CONTENT_EID from card data */
function populateContentEntity(
  eid: number,
  ctx: CanvasRenderingContext2D,
  card: Card,
  width: number,
  height: number,
): void {
  canvasStore[eid] = { ctx, width, height }
  styleStore[eid] = resolveStyle(card.kind)
  layoutStore[eid] = createLayout(width, height)
  cardDataStore[eid] = { card }
  iconStore[eid] = resolveIcon(card.kind)
  rawMetaStore[eid] = (card.meta || {}) as Readonly<Record<string, unknown>>

  // Clear all meta stores first, then set the active one
  dataMetaStore[eid] = undefined
  chartMetaStore[eid] = undefined
  quoteMetaStore[eid] = undefined
  argumentMetaStore[eid] = undefined
  tableMetaStore[eid] = undefined
  codeMetaStore[eid] = undefined
  keypointMetaStore[eid] = undefined
  definitionMetaStore[eid] = undefined
  exampleMetaStore[eid] = undefined
  referenceMetaStore[eid] = undefined
  inspirationMetaStore[eid] = undefined
  timelineMetaStore[eid] = undefined
  comparisonMetaStore[eid] = undefined
  processMetaStore[eid] = undefined
  summaryMetaStore[eid] = undefined
  gifMetaStore[eid] = undefined
  qrcodeMetaStore[eid] = undefined
  personMetaStore[eid] = undefined
  terminalMetaStore[eid] = undefined
  lottieMetaStore[eid] = undefined
  webpageMetaStore[eid] = undefined
  countdownMetaStore[eid] = undefined
  threeDMetaStore[eid] = undefined
  imageMetaStore[eid] = undefined
  live2dMetaStore[eid] = undefined
  linkMetaStore[eid] = undefined
  fileMetaStore[eid] = undefined
  mathMetaStore[eid] = undefined
  todoMetaStore[eid] = undefined
  positionMetaStore[eid] = undefined
  timestampMetaStore[eid] = undefined
  colorMetaStore[eid] = undefined
  eventMetaStore[eid] = undefined
  voiceMetaStore[eid] = undefined
  commentMetaStore[eid] = undefined
  storyMetaStore[eid] = undefined
  socialMetaStore[eid] = undefined
  pokerMetaStore[eid] = undefined
  tarotMetaStore[eid] = undefined

  const meta = card.meta as any
  if (!meta) return

  switch (card.kind) {
    case 'data':
      dataMetaStore[eid] = meta
      break
    case 'chart':
      chartMetaStore[eid] = meta
      break
    case 'quote':
      quoteMetaStore[eid] = meta
      break
    case 'argument':
      argumentMetaStore[eid] = meta
      break
    case 'table':
      tableMetaStore[eid] = meta
      break
    case 'code':
      codeMetaStore[eid] = meta
      break
    case 'keypoint':
      keypointMetaStore[eid] = meta
      break
    case 'definition':
      definitionMetaStore[eid] = meta
      break
    case 'example':
      exampleMetaStore[eid] = meta
      break
    case 'reference':
      referenceMetaStore[eid] = meta
      break
    case 'inspiration':
    case 'idea':
      inspirationMetaStore[eid] = meta
      break
    case 'timeline':
      timelineMetaStore[eid] = meta
      break
    case 'comparison':
      comparisonMetaStore[eid] = meta
      break
    case 'process':
      processMetaStore[eid] = meta
      break
    case 'summary':
      summaryMetaStore[eid] = meta
      break
    case 'gif':
      gifMetaStore[eid] = meta
      break
    case 'image':
      imageMetaStore[eid] = meta
      break
    case 'qrcode':
      qrcodeMetaStore[eid] = meta
      break
    case 'person':
      personMetaStore[eid] = meta
      break
    case 'terminal':
      terminalMetaStore[eid] = meta
      break
    case 'lottie':
      lottieMetaStore[eid] = meta
      break
    case 'webpage':
      webpageMetaStore[eid] = meta
      break
    case 'countdown':
      countdownMetaStore[eid] = meta
      break
    case 'threed':
      threeDMetaStore[eid] = meta
      break
    case 'live2d':
      live2dMetaStore[eid] = meta
      break
    case 'link':
      linkMetaStore[eid] = meta
      break
    case 'file':
      fileMetaStore[eid] = meta
      break
    case 'math':
      mathMetaStore[eid] = meta
      break
    case 'todo':
      todoMetaStore[eid] = meta
      break
    case 'position':
      positionMetaStore[eid] = meta
      break
    case 'timestamp':
      timestampMetaStore[eid] = meta
      break
    case 'color':
      colorMetaStore[eid] = meta
      break
    case 'event':
      eventMetaStore[eid] = meta
      break
    case 'voice':
      voiceMetaStore[eid] = meta
      break
    case 'comment':
      commentMetaStore[eid] = meta
      break
    case 'story':
      storyMetaStore[eid] = meta
      break
    case 'social':
      socialMetaStore[eid] = meta
      break
    case 'poker':
      pokerMetaStore[eid] = meta
      break
    case 'tarot':
      tarotMetaStore[eid] = meta
      break
  }
}

/**
 * Run content pipeline for one card (produces card texture).
 * Two-pass: measure → vertical center → draw.
 */
export function runPipeline(
  ctx: CanvasRenderingContext2D,
  card: Card,
  width: number,
  height: number,
): void {
  const eid = CONTENT_EID
  populateContentEntity(eid, ctx, card, width, height)
  const layout = layoutStore[eid]!

  // Poker and tarot cards take over the full canvas — skip header/footer/bg
  const fullBleed = card.kind === 'poker' || card.kind === 'tarot'

  if (!fullBleed) {
    // Use roundRect fill (not clip) so canvas corners are opaque parchment,
    // matching the GL shader's edge exactly and avoiding premultiplied-alpha bleed.
    ctx.fillStyle = '#fdf8f0'
    ctx.beginPath()
    ctx.roundRect(0, 0, width, height, 14)
    ctx.fill()
  }

  if (!fullBleed) {
    for (const sys of preDecorators) sys(eid)
  }

  layout.contentStartY = layout.cursorY
  const contentTopY = layout.cursorY

  for (const sys of contentSystems) {
    if (sys(eid)) break
  }

  if (!fullBleed) {
    const contentH = layout.cursorY - contentTopY
    const availableH = layout.contentBottom - contentTopY

    if (contentH > 0 && contentH < availableH * 0.65) {
      const shiftY = Math.round((availableH - contentH) * 0.35)
      if (shiftY > 3) {
        ctx.clearRect(0, contentTopY, width, availableH)
        ctx.fillStyle = '#fdf8f0'
        ctx.fillRect(0, contentTopY, width, availableH)
        layout.cursorY = contentTopY + shiftY
        layout.contentStartY = layout.cursorY
        for (const sys of contentSystems) {
          if (sys(eid)) break
        }
      }
    }

    for (const sys of postDecorators) sys(eid)
  }
}

// ═══════════════════════════════════════
// § 2. Scene World (bitECS persistent entities)
// ═══════════════════════════════════════

let _nextZ = 0

/**
 * SceneWorld wraps the bitECS sceneWorld.
 * Each card maps to a single numeric EID with SoA/AoS component stores.
 */
export class SceneWorld {
  /** Get or create a bitECS entity for a card, returns its EID */
  getOrCreate(card: Card, cardW: number, cardH: number): number {
    let eid = getCardEid(card.id)
    if (eid === undefined) {
      eid = createSceneEntity(card.id)

      // SoA numeric components
      Transform.x[eid] = 0
      Transform.y[eid] = 0
      Transform.angle[eid] = 0
      Transform.width[eid] = cardW
      Transform.height[eid] = cardH

      Interaction.hovered[eid] = 0
      Interaction.active[eid] = 0
      Interaction.selected[eid] = 0
      Interaction.streaming[eid] = card.isStreaming ? 1 : 0
      Interaction.mouseLocalX[eid] = 0
      Interaction.mouseLocalY[eid] = 0

      Flip.angle[eid] = 0
      Flip.target[eid] = 0
      Flip.velocity[eid] = 0
      Flip.progress[eid] = 0

      Visibility.visible[eid] = 1
      Visibility.screenX[eid] = 0
      Visibility.screenY[eid] = 0

      RenderOrder.z[eid] = _nextZ++

      // AoS object components
      cardDataStore[eid] = { card }
      shaderStyleStore[eid] = resolveShaderStyle(card.kind, card.priority)

      // Register with bitECS world
      addComponent(sceneWorld, eid, Transform)
      addComponent(sceneWorld, eid, Interaction)
      addComponent(sceneWorld, eid, Flip)
      addComponent(sceneWorld, eid, Visibility)
      addComponent(sceneWorld, eid, RenderOrder)
      addComponent(sceneWorld, eid, CCardData)
      addComponent(sceneWorld, eid, CShaderStyle)
    } else {
      cardDataStore[eid] = { card }
    }
    return eid
  }

  /** Sync transform from physics body */
  syncTransform(eid: number, x: number, y: number, angle: number): void {
    Transform.x[eid] = x
    Transform.y[eid] = y
    Transform.angle[eid] = angle
  }

  /** Get EID for a card ID */
  get(cardId: string): number | undefined {
    return getCardEid(cardId)
  }

  /** Garbage collect entities for cards no longer present */
  gc(activeIds: Set<string>, onRemove?: (eid: number, cardId: string) => void): void {
    const toRemove: string[] = []
    for (const eid of allSceneEids()) {
      const cardId = getEidCardId(eid)!
      if (!activeIds.has(cardId)) {
        if (onRemove) onRemove(eid, cardId)
        toRemove.push(cardId)
      }
    }
    for (const cardId of toRemove) {
      destroySceneEntity(cardId)
    }
  }

  /** Iterate all scene entity EIDs */
  all(): IterableIterator<number> {
    return allSceneEids()
  }

  /** Bring a card to top z-order */
  bringToFront(cardId: string): void {
    const eid = getCardEid(cardId)
    if (eid !== undefined) {
      RenderOrder.z[eid] = _nextZ++
    }
  }

  /** Clear all entities */
  clear(): void {
    for (const eid of allSceneEids()) {
      const cardId = getEidCardId(eid)!
      destroySceneEntity(cardId)
    }
  }
}

/** Reset content system registries. For testing. */
export function clearSystems() {
  preDecorators.length = 0
  contentSystems.length = 0
  postDecorators.length = 0
}
