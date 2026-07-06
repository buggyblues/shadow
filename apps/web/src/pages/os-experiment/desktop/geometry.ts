import type { DragEvent } from 'react'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { OS_TOP_BAR_HEIGHT, OS_WORKSPACE_NODE_DRAG_TYPE } from '../utils'

export const DESKTOP_GRID_TOP = OS_TOP_BAR_HEIGHT + 16
export const DESKTOP_GRID_LEFT = 24
export const DESKTOP_GRID_RIGHT = 28
export const DESKTOP_CELL_WIDTH = 52
export const DESKTOP_CELL_HEIGHT = 56
export const DESKTOP_ICON_CELL_SPAN = 2
export const DESKTOP_ICON_SLOT_WIDTH = DESKTOP_CELL_WIDTH * DESKTOP_ICON_CELL_SPAN
export const DESKTOP_ICON_SLOT_HEIGHT = DESKTOP_CELL_HEIGHT * DESKTOP_ICON_CELL_SPAN
export const DESKTOP_ICON_WIDTH = 92
export const DESKTOP_ICON_HEIGHT = 108
export const DESKTOP_DRAG_START_DISTANCE = 6
export const WIDGET_ROTATION_SNAP_DEGREES = 15
export const DESKTOP_WIDGET_DEFAULT_Z_INDEX = 10
export const DESKTOP_WIDGET_MAX_Z_INDEX = 1000
export const DESKTOP_ICON_SURFACE_CLASS =
  'grid h-14 w-14 place-items-center rounded-[16px] border border-white/12 shadow-[0_10px_24px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]'
export const DESKTOP_ICON_TEXT_SHADOW = '0 1px 3px rgba(0,0,0,0.68)'

export function desktopRowsPerColumn() {
  const availableHeight =
    typeof window === 'undefined'
      ? 720
      : Math.max(DESKTOP_ICON_SLOT_HEIGHT, window.innerHeight - DESKTOP_GRID_TOP - 88)
  return Math.max(1, Math.floor(availableHeight / DESKTOP_ICON_SLOT_HEIGHT))
}

export function desktopFineRowsPerColumn() {
  const availableHeight =
    typeof window === 'undefined'
      ? 720
      : Math.max(DESKTOP_CELL_HEIGHT, window.innerHeight - DESKTOP_GRID_TOP - 88)
  return Math.max(1, Math.floor(availableHeight / DESKTOP_CELL_HEIGHT))
}

export function desktopMaxIconColumn() {
  if (typeof window === 'undefined') return 0
  const availableWidth = Math.max(
    DESKTOP_ICON_SLOT_WIDTH,
    window.innerWidth - DESKTOP_GRID_LEFT - DESKTOP_GRID_RIGHT,
  )
  return Math.max(0, Math.floor((availableWidth - DESKTOP_ICON_WIDTH) / DESKTOP_ICON_SLOT_WIDTH))
}

export function desktopMaxColumn() {
  if (typeof window === 'undefined') return 0
  const availableWidth = Math.max(
    DESKTOP_CELL_WIDTH,
    window.innerWidth - DESKTOP_GRID_LEFT - DESKTOP_GRID_RIGHT,
  )
  return Math.max(0, Math.floor((availableWidth - DESKTOP_CELL_WIDTH) / DESKTOP_CELL_WIDTH))
}

export function desktopPointForIconCell(col: number, row: number) {
  return {
    x: DESKTOP_GRID_LEFT + col * DESKTOP_ICON_SLOT_WIDTH,
    y: DESKTOP_GRID_TOP + row * DESKTOP_ICON_SLOT_HEIGHT,
  }
}

export function desktopPointForCell(col: number, row: number) {
  return {
    x: DESKTOP_GRID_LEFT + col * DESKTOP_CELL_WIDTH,
    y: DESKTOP_GRID_TOP + row * DESKTOP_CELL_HEIGHT,
  }
}

export function desktopIconCellForPoint(point: { x: number; y: number }) {
  const col = Math.min(
    desktopMaxIconColumn(),
    Math.max(0, Math.round((point.x - DESKTOP_GRID_LEFT) / DESKTOP_ICON_SLOT_WIDTH)),
  )
  const row = Math.min(
    desktopRowsPerColumn() - 1,
    Math.max(0, Math.round((point.y - DESKTOP_GRID_TOP) / DESKTOP_ICON_SLOT_HEIGHT)),
  )
  return { col, row }
}

export function desktopCellForPoint(point: { x: number; y: number }) {
  const col = Math.min(
    desktopMaxColumn(),
    Math.max(0, Math.round((point.x - DESKTOP_GRID_LEFT) / DESKTOP_CELL_WIDTH)),
  )
  const row = Math.min(
    desktopFineRowsPerColumn() - 1,
    Math.max(0, Math.round((point.y - DESKTOP_GRID_TOP) / DESKTOP_CELL_HEIGHT)),
  )
  return { col, row }
}

export function desktopIconCellKey(point: { x: number; y: number }) {
  const cell = desktopIconCellForPoint(point)
  return `${cell.col}:${cell.row}`
}

export function desktopCellKey(point: { x: number; y: number }) {
  const cell = desktopCellForPoint(point)
  return `${cell.col}:${cell.row}`
}

export function parseWorkspaceDrag(event: DragEvent<HTMLElement>) {
  const raw = event.dataTransfer.getData(OS_WORKSPACE_NODE_DRAG_TYPE)
  if (!raw) return null
  try {
    const node = JSON.parse(raw) as WorkspaceNode
    return node.kind === 'file' || node.kind === 'dir' ? node : null
  } catch {
    return null
  }
}

export function defaultDesktopFilePosition(index: number) {
  const rowsPerColumn = desktopRowsPerColumn()
  const col = Math.floor(index / rowsPerColumn)
  const row = index % rowsPerColumn
  return desktopPointForIconCell(Math.min(col, desktopMaxIconColumn()), row)
}

export function snapDesktopIconPoint(
  point: { x: number; y: number },
  options?: { occupied?: Array<{ x: number; y: number }> },
) {
  const start = desktopIconCellForPoint(point)
  const occupied = new Set((options?.occupied ?? []).map(desktopIconCellKey))
  const maxColumn = desktopMaxIconColumn()
  const rows = desktopRowsPerColumn()

  for (let radius = 0; radius <= Math.max(maxColumn, rows) + 2; radius++) {
    for (
      let col = Math.max(0, start.col - radius);
      col <= Math.min(maxColumn, start.col + radius);
      col++
    ) {
      for (
        let row = Math.max(0, start.row - radius);
        row <= Math.min(rows - 1, start.row + radius);
        row++
      ) {
        if (Math.abs(col - start.col) !== radius && Math.abs(row - start.row) !== radius) continue
        const next = desktopPointForIconCell(col, row)
        if (!occupied.has(desktopIconCellKey(next))) return next
      }
    }
  }

  return desktopPointForIconCell(start.col, start.row)
}

export function snapDesktopPoint(
  point: { x: number; y: number },
  options?: { occupied?: Array<{ x: number; y: number }> },
) {
  const start = desktopCellForPoint(point)
  const occupied = new Set((options?.occupied ?? []).map(desktopCellKey))
  const maxColumn = desktopMaxColumn()
  const rows = desktopFineRowsPerColumn()

  for (let radius = 0; radius <= Math.max(maxColumn, rows) + 2; radius++) {
    for (
      let col = Math.max(0, start.col - radius);
      col <= Math.min(maxColumn, start.col + radius);
      col++
    ) {
      for (
        let row = Math.max(0, start.row - radius);
        row <= Math.min(rows - 1, start.row + radius);
        row++
      ) {
        if (Math.abs(col - start.col) !== radius && Math.abs(row - start.row) !== radius) continue
        const next = desktopPointForCell(col, row)
        if (!occupied.has(desktopCellKey(next))) return next
      }
    }
  }

  return desktopPointForCell(start.col, start.row)
}
