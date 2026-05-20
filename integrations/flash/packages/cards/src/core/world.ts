// ══════════════════════════════════════════════════════════════
// @shadowob/flash-cards — ECS World (registry-based content pipeline)
//
// Two-tier architecture:
//   1. ContentPipeline — ephemeral per-card texture rendering
//   2. SceneWorld — persistent bitECS entities across frames
//
// Meta stores are managed by the CardPluginRegistry (generic,
// not hardcoded per kind).
// ══════════════════════════════════════════════════════════════

import type { Card } from '@shadowob/flash-types'
import { addComponent } from 'bitecs'
import { ASSET_BACKEND_NONE, Asset } from '../components/assetComponent'
import { canvasStore } from '../components/canvasComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { Flip, setFlipTarget } from '../components/flipComponent'
import { iconStore, resolveIcon } from '../components/iconComponent'
import { Interaction } from '../components/interactionComponent'
import { createLayout, layoutStore } from '../components/layoutComponent'
import { RenderOrder } from '../components/renderOrderComponent'
import { Runtime } from '../components/runtimeComponent'
import { resolveShaderStyle, shaderStyleStore } from '../components/shaderStyleComponent'
import { resolveStyle, styleStore } from '../components/styleComponent'
import { Transform } from '../components/transformComponent'
import { Visibility } from '../components/visibilityComponent'
import { registry } from '../registry'
import { paintCardFaceBase, paintCardFacePatch } from '../resources/cardFaceMaterial'
import type { ContentSystem, DecoratorSystem } from '../types'
import {
  allSceneEids,
  CONTENT_EID,
  createSceneEntity,
  destroySceneEntity,
  getCardEid,
  getEidCardId,
  sceneWorld,
} from './entity'

// Re-export worlds so systems can import them
export { CONTENT_EID, sceneWorld } from './entity'

// ═══════════════════════════════════════
// § 1. Content Pipeline (texture rendering)
// ═══════════════════════════════════════

/** Populate content component stores for CONTENT_EID from card data */
function populateContentEntity(
  eid: number,
  ctx: CanvasRenderingContext2D,
  card: Card,
  width: number,
  height: number,
): void {
  canvasStore[eid] = { ctx, width, height }
  styleStore[eid] = resolveStyle(card.kind as any)
  layoutStore[eid] = createLayout(width, height)
  cardDataStore[eid] = { card }
  iconStore[eid] = resolveIcon(card.kind as any)

  // Use registry-based generic meta stores (replaces hardcoded switch)
  registry.populateMeta(eid, card.kind, card.meta)
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

  // Get systems from registry
  const preDecorators = registry.getPreDecorators()
  const contentSystems = registry.getContentSystems()
  const postDecorators = registry.getPostDecorators()

  // Check plugin render hints — fullBleed means plugin takes over the whole canvas
  const renderDef = registry.getRenderDef(card.kind)
  const fullBleed = renderDef?.fullBleed ?? false
  const bgColor = renderDef?.bgColor ?? '#fdf8f0'

  if (!fullBleed) {
    paintCardFaceBase(ctx, width, height, bgColor)
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
        paintCardFacePatch(ctx, width, height, 0, contentTopY, width, availableH, bgColor)
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

/** @internal Component tags used only in this module */
const CCardData = {}
const CShaderStyle = {}
const CAssetState = Asset
const CTransform = Transform
const CInteraction = Interaction
const CFlip = Flip
const CVisibility = Visibility
const CRenderOrder = RenderOrder
const CRuntime = Runtime

let _nextZ = 0

interface PersistedSceneLayout {
  flipped?: boolean
}

function persistedSceneLayout(card: Card): PersistedSceneLayout | null {
  const meta = card.meta as { layout?: PersistedSceneLayout } | null
  const layout = meta?.layout
  if (!layout || typeof layout !== 'object') return null
  return layout
}

/**
 * SceneWorld wraps the bitECS sceneWorld.
 * Each card maps to a single numeric EID with SoA/AoS component stores.
 */
export class SceneWorld {
  private persistedFlipByCardId = new Map<string, boolean | undefined>()

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
      Interaction.hoverAmount[eid] = 0
      Interaction.active[eid] = 0
      Interaction.selected[eid] = 0
      Interaction.streaming[eid] = card.isStreaming ? 1 : 0
      Interaction.mouseLocalX[eid] = 0
      Interaction.mouseLocalY[eid] = 0

      const layout = persistedSceneLayout(card)
      this.persistedFlipByCardId.set(card.id, layout?.flipped)
      Flip.angle[eid] = layout?.flipped ? Math.PI : 0
      Flip.target[eid] = layout?.flipped ? Math.PI : 0
      Flip.velocity[eid] = 0
      Flip.progress[eid] = layout?.flipped ? 1 : 0

      Visibility.visible[eid] = 1
      Visibility.screenX[eid] = 0
      Visibility.screenY[eid] = 0

      RenderOrder.z[eid] = _nextZ++

      Runtime.kind[eid] = 0
      Runtime.active[eid] = 0
      Runtime.autoplay[eid] = 0
      Runtime.preload[eid] = 0
      Runtime.prewarm[eid] = 0
      Runtime.prepare[eid] = 0
      Runtime.priority[eid] = 0

      Asset.faceVersion[eid] = -1
      Asset.faceLod[eid] = 0
      Asset.faceBytes[eid] = 0
      Asset.uploadPending[eid] = 0
      Asset.gpuResident[eid] = 0
      Asset.lastTouchedFrame[eid] = 0
      Asset.lastUploadedFrame[eid] = 0
      Asset.backend[eid] = ASSET_BACKEND_NONE

      // AoS object components
      cardDataStore[eid] = { card }
      shaderStyleStore[eid] = resolveShaderStyle(card.kind as any, card.priority)

      // Register with bitECS world
      addComponent(sceneWorld, eid, CTransform)
      addComponent(sceneWorld, eid, CInteraction)
      addComponent(sceneWorld, eid, CFlip)
      addComponent(sceneWorld, eid, CVisibility)
      addComponent(sceneWorld, eid, CRenderOrder)
      addComponent(sceneWorld, eid, CRuntime)
      addComponent(sceneWorld, eid, CAssetState)
      addComponent(sceneWorld, eid, CCardData)
      addComponent(sceneWorld, eid, CShaderStyle)
    } else {
      cardDataStore[eid] = { card }
      const layout = persistedSceneLayout(card)
      const nextFlipped = layout?.flipped
      const previousFlipped = this.persistedFlipByCardId.get(card.id)
      if (nextFlipped !== undefined && nextFlipped !== previousFlipped) {
        setFlipTarget(eid, nextFlipped)
      }
      this.persistedFlipByCardId.set(card.id, nextFlipped)
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
      this.persistedFlipByCardId.delete(cardId)
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
    this.persistedFlipByCardId.clear()
  }
}
