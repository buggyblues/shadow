import { beforeEach, describe, expect, it } from 'vitest'
import { DESKTOP_CELL_HEIGHT, DESKTOP_CELL_WIDTH, DESKTOP_GRID_TOP } from './desktop/geometry'
import { nextDesktopWidgetPoint } from './desktop-layout-helpers'
import type { OsDesktopWidget } from './types'

describe('nextDesktopWidgetPoint', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 })
  })

  it('moves a newly added widget to the nearest non-overlapping grid area', () => {
    const existing: OsDesktopWidget[] = [
      {
        id: 'note',
        kind: 'sticky-note',
        x: 24,
        y: DESKTOP_GRID_TOP,
        widthCells: 6,
        heightCells: 4,
        content: 'Paris',
      },
    ]

    const point = nextDesktopWidgetPoint(
      existing,
      { x: 24, y: DESKTOP_GRID_TOP },
      { widthCells: 6, heightCells: 4 },
    )

    const newColumn = Math.round((point.x - 24) / DESKTOP_CELL_WIDTH)
    const newRow = Math.round((point.y - DESKTOP_GRID_TOP) / DESKTOP_CELL_HEIGHT)
    expect(newColumn >= 6 || newRow >= 4).toBe(true)
  })

  it('ignores the existing position when replacing the same widget', () => {
    const existing: OsDesktopWidget[] = [
      {
        id: 'photo',
        kind: 'photo',
        sourceType: 'url',
        source: 'https://example.com/paris.jpg',
        x: 544,
        y: 336,
        widthCells: 6,
        aspectRatio: 1.5,
        rotation: 0,
      },
    ]

    expect(
      nextDesktopWidgetPoint(
        existing,
        { x: 544, y: 336 },
        { widthCells: 6, heightCells: 4 },
        'photo',
      ),
    ).toEqual({ x: 544, y: 336 })
  })

  it('keeps a visual gap from widgets that are not exactly aligned to the grid', () => {
    const existing: OsDesktopWidget[] = [
      {
        id: 'note',
        kind: 'sticky-note',
        x: 388,
        y: 76,
        widthCells: 6,
        heightCells: 3,
        content: 'Paris',
      },
    ]

    const point = nextDesktopWidgetPoint(
      existing,
      { x: 544, y: 224 },
      { widthCells: 6, heightCells: 4 },
    )

    expect(point.y).toBeGreaterThanOrEqual(280)
  })
})
