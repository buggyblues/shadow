// ══════════════════════════════════════════════════════════════
// Viewport Resource
//
// Encapsulates the pan/zoom camera state and all mutation ops.
// Pure functions: no side effects beyond mutating the ViewportData.
// ══════════════════════════════════════════════════════════════

import type { ViewportData } from '../components/viewportComponent'

export type { ViewportData }

const MIN_ZOOM = 0.08
const MAX_ZOOM = 8.0

export function createViewport(dpr: number): ViewportData {
  return { offsetX: 0, offsetY: 0, zoom: 1.0, dpr, screenW: 0, screenH: 0, zoomSettled: true }
}

export function panViewport(v: ViewportData, dx: number, dy: number): void {
  v.offsetX -= dx / v.zoom
  v.offsetY -= dy / v.zoom
}

export function zoomViewport(
  v: ViewportData,
  screenX: number,
  screenY: number,
  factor: number,
): void {
  const oldZoom = v.zoom
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor))
  const worldX = screenX / oldZoom + v.offsetX
  const worldY = screenY / oldZoom + v.offsetY
  v.offsetX = worldX - screenX / newZoom
  v.offsetY = worldY - screenY / newZoom
  v.zoom = newZoom
}

export function setViewportZoom(v: ViewportData, zoom: number): void {
  v.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

export function viewportScreenToWorld(
  v: ViewportData,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: sx / v.zoom + v.offsetX, y: sy / v.zoom + v.offsetY }
}

/**
 * Center the viewport to zoom-fit all bodies in the bodiesMap.
 */
export function centerViewportOnCards(
  v: ViewportData,
  bodiesMap: Map<string, { position: { x: number; y: number } }>,
  screenW: number,
  screenH: number,
  cardW: number,
  cardH: number,
): void {
  if (bodiesMap.size === 0) return

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [, body] of bodiesMap) {
    minX = Math.min(minX, body.position.x)
    minY = Math.min(minY, body.position.y)
    maxX = Math.max(maxX, body.position.x)
    maxY = Math.max(maxY, body.position.y)
  }

  const contentW = maxX - minX + cardW
  const contentH = maxY - minY + cardH
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const padding = 80
  const scaleX = (screenW - padding * 2) / contentW
  const scaleY = (screenH - padding * 2) / contentH
  const newZoom = Math.max(0.15, Math.min(1.2, Math.min(scaleX, scaleY)))

  v.zoom = newZoom
  v.offsetX = centerX - screenW / (2 * newZoom)
  v.offsetY = centerY - screenH / (2 * newZoom)
}
