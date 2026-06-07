import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, screen } from 'electron'

export type PetWindowState = {
  x: number
  y: number
  width: number
  height: number
}

const DEFAULT_WIDTH = 240
const DEFAULT_HEIGHT = 240

function getStatePath(): string {
  return join(app.getPath('userData'), 'pet-window-state.json')
}

function getDefaultPetWindowState(): PetWindowState {
  const display = screen.getPrimaryDisplay()
  const bounds = display.workArea
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x: Math.max(bounds.x, bounds.x + bounds.width - DEFAULT_WIDTH - 32),
    y: Math.max(bounds.y, bounds.y + bounds.height - DEFAULT_HEIGHT - 32),
  }
}

export class PetWindowStateService {
  readPetWindowState(): PetWindowState {
    try {
      const path = getStatePath()
      if (!existsSync(path)) return getDefaultPetWindowState()
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<PetWindowState>
      return {
        ...getDefaultPetWindowState(),
        ...parsed,
        width: Math.max(180, Math.min(700, Number(parsed.width) || DEFAULT_WIDTH)),
        height: Math.max(180, Math.min(520, Number(parsed.height) || DEFAULT_HEIGHT)),
      }
    } catch {
      return getDefaultPetWindowState()
    }
  }

  savePetWindowState(state: PetWindowState): void {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(getStatePath(), JSON.stringify(state))
    } catch (error) {
      console.error('Failed to save pet window state:', error)
    }
  }
}

export const petWindowStateService = new PetWindowStateService()
