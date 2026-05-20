// ══════════════════════════════════════════════════════════════
// Resource — Spatial Index
//
// RBush-backed world-space index for ECS card entities. It is rebuilt from
// scene transforms after ECS scene updates and reused by hover, selection,
// viewport prewarm, and future dirty-region queries.
// ══════════════════════════════════════════════════════════════

import RBush from 'rbush'
import { RenderOrder } from '../components/renderOrderComponent'
import { Transform } from '../components/transformComponent'
import { Visibility } from '../components/visibilityComponent'
import type { SceneWorld } from '../core/world'
import { hitTestPoint, hitTestRect } from '../systems/render/hitTestSystem'

export interface CardSpatialItem {
  minX: number
  minY: number
  maxX: number
  maxY: number
  eid: number
  cardId: string
  z: number
}

export interface SpatialIndexStats {
  indexed: number
  rebuilds: number
}

export class CardSpatialIndex {
  private tree = new RBush<CardSpatialItem>()
  private cardItems = new Map<string, CardSpatialItem>()
  private rebuilds = 0

  rebuild(
    scene: SceneWorld,
    cards: Array<{ id: string }>,
    cardW: number,
    cardH: number,
    hiddenCardIds?: Set<string>,
  ): void {
    const items: CardSpatialItem[] = []

    for (const card of cards) {
      if (!card?.id || hiddenCardIds?.has(card.id)) continue
      const eid = scene.get(card.id)
      if (eid == null || !Visibility.visible[eid] || Transform.x[eid] == null) continue
      items.push(this.createItem(eid, card.id, cardW, cardH))
    }

    this.tree.clear()
    if (items.length > 0) this.tree.load(items)
    this.cardItems.clear()
    for (const item of items) this.cardItems.set(item.cardId, item)
    this.rebuilds += 1
  }

  hitTestPoint(worldX: number, worldY: number, cardW: number, cardH: number): string | null {
    const candidates = this.tree.search({
      minX: worldX,
      minY: worldY,
      maxX: worldX,
      maxY: worldY,
    })
    candidates.sort((a, b) => b.z - a.z)

    for (const item of candidates) {
      if (hitTestPoint(item.eid, worldX, worldY, cardW, cardH)) return item.cardId
    }
    return null
  }

  hitTestRect(minX: number, minY: number, maxX: number, maxY: number): Set<string> {
    const result = new Set<string>()
    const candidates = this.tree.search({ minX, minY, maxX, maxY })

    for (const item of candidates) {
      if (hitTestRect(item.eid, minX, minY, maxX, maxY)) result.add(item.cardId)
    }
    return result
  }

  search(minX: number, minY: number, maxX: number, maxY: number): CardSpatialItem[] {
    return this.tree.search({ minX, minY, maxX, maxY })
  }

  getStats(): SpatialIndexStats {
    return {
      indexed: this.cardItems.size,
      rebuilds: this.rebuilds,
    }
  }

  clear(): void {
    this.tree.clear()
    this.cardItems.clear()
  }

  private createItem(eid: number, cardId: string, cardW: number, cardH: number): CardSpatialItem {
    const cx = Transform.x[eid]
    const cy = Transform.y[eid]
    const angle = Transform.angle[eid] ?? 0
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const hx = cardW * 0.5
    const hy = cardH * 0.5
    const extentX = Math.abs(cos) * hx + Math.abs(sin) * hy
    const extentY = Math.abs(sin) * hx + Math.abs(cos) * hy

    return {
      minX: cx - extentX,
      minY: cy - extentY,
      maxX: cx + extentX,
      maxY: cy + extentY,
      eid,
      cardId,
      z: RenderOrder.z[eid] ?? 0,
    }
  }
}
