import { useMemo } from 'react'
import { type WindowRect, windowEdgeClass } from '../components/window-geometry'
import type { OsWindowState } from '../types'
import { DOCK_RESERVED_HEIGHT, OS_TOP_BAR_HEIGHT } from '../utils'

function displayRectForWindow(item: OsWindowState): WindowRect {
  if (!item.maximized || typeof window === 'undefined') {
    return {
      height: item.height,
      width: item.width,
      x: item.x,
      y: item.y,
    }
  }

  return {
    height: window.innerHeight - OS_TOP_BAR_HEIGHT - DOCK_RESERVED_HEIGHT,
    width: window.innerWidth,
    x: 0,
    y: OS_TOP_BAR_HEIGHT,
  }
}

export function useWindowEdgeClassById(windows: OsWindowState[]) {
  return useMemo(
    () =>
      new Map(
        windows.map((item) => [
          item.id,
          windowEdgeClass(
            displayRectForWindow(item),
            windows.filter((sibling) => sibling.id !== item.id),
          ),
        ]),
      ),
    [windows],
  )
}
