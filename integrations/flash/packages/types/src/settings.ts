// ═══════════════════════════════════════════════════════════════
// @shadowob/flash-types — Settings
// ═══════════════════════════════════════════════════════════════

export interface UserSettings {
  displayName: string
  language: string
  aiLanguage: string
  defaultResearchGoals: string[]
  autoCurate: boolean
  autoPipeline: boolean
  notifications: boolean
  autoInspire: boolean
  autoResearch: boolean
  heartbeatInterval: number
  autoConsumeTodos: boolean
}

export interface AppSettings {
  userSettings: UserSettings
}
