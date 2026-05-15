import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, screen } from 'electron'

export type PetWindowState = {
  x: number
  y: number
  width: number
  height: number
}

const DEFAULT_WIDTH = 440
const DEFAULT_HEIGHT = 640

function statePath() {
  return join(app.getPath('userData'), 'pet-window-state.json')
}

export function getDefaultWindowState(): PetWindowState {
  const area = screen.getPrimaryDisplay().workArea
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x: Math.max(area.x + 16, area.x + area.width - DEFAULT_WIDTH - 32),
    y: Math.max(area.y + 16, area.y + area.height - DEFAULT_HEIGHT - 32),
  }
}

export function readWindowState(): PetWindowState {
  try {
    const path = statePath()
    if (!existsSync(path)) return getDefaultWindowState()
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PetWindowState>
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return getDefaultWindowState()
    }
    return {
      x: parsed.x,
      y: parsed.y,
      width: Math.max(320, parsed.width),
      height: Math.max(360, parsed.height),
    }
  } catch {
    return getDefaultWindowState()
  }
}

export function saveWindowState(state: PetWindowState) {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(statePath(), JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save pet window state:', error)
  }
}
