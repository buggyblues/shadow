import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

function getStatePath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'window-state.json')
}

export function getWindowState(): WindowState | null {
  try {
    const data = readFileSync(getStatePath(), 'utf-8')
    return JSON.parse(data) as WindowState
  } catch {
    return null
  }
}

export function saveWindowState(state: WindowState): void {
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    writeFileSync(getStatePath(), JSON.stringify(state))
  } catch (err) {
    console.error('Failed to save window state:', err)
  }
}
