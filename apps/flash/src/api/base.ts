import type {
  ApiResponse,
  Card,
  Deck,
  Material,
  OutlineItem,
  SdkThemeDetail,
  SdkThemeItem,
  SkillDef,
  ThemePreset,
  TodoItem,
} from '../types'

export const BASE = '/api'

/** Generate a unique ID */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export type {
  ApiResponse,
  Card,
  Deck,
  Material,
  OutlineItem,
  SdkThemeDetail,
  SdkThemeItem,
  SkillDef,
  ThemePreset,
  TodoItem,
}
