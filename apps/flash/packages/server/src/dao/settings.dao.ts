// ═══════════════════════════════════════════════════════════════
// SettingsDAO — Global user settings
//
// v8: Settings are global → /data/settings.json
// ═══════════════════════════════════════════════════════════════

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { SETTINGS_FILE } from '../config.js'

export const settingsDao = {
  async load(): Promise<Record<string, unknown> | null> {
    try {
      if (existsSync(SETTINGS_FILE)) {
        return JSON.parse(await readFile(SETTINGS_FILE, 'utf-8'))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[SettingsDAO] Load failed:', msg)
    }
    return null
  },

  async save(settings: unknown): Promise<void> {
    try {
      await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[SettingsDAO] Save failed:', msg)
    }
  },
}
