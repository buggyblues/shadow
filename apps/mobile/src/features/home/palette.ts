import { type ColorTokens, palette, useColors } from '../../theme'
import {
  UNIFIED_HOME_ACCENT_COLOR,
  UNIFIED_HOME_BORDER_COLOR,
  UNIFIED_HOME_DANGER_COLOR,
  UNIFIED_HOME_DARK_BASE_COLOR,
  UNIFIED_HOME_DARK_SURFACE_COLOR,
  UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR,
  UNIFIED_HOME_LIGHT_BASE_COLOR,
  UNIFIED_HOME_LIGHT_SURFACE_COLOR,
  UNIFIED_HOME_LIGHT_SURFACE_MUTED_COLOR,
  UNIFIED_HOME_TEXT_COLOR,
  UNIFIED_HOME_TEXT_MUTED_COLOR,
  UNIFIED_HOME_TEXT_SECONDARY_COLOR,
} from './constants'

export type UnifiedHomePalette = {
  base: string
  text: string
  textSecondary: string
  textMuted: string
  textSubtle: string
  accent: string
  accentSurface: string
  danger: string
  surface: string
  surfaceMuted: string
  border: string
  buttonSurface: string
  buttonBorder: string
  coverStart: string
  coverMiddle: string
  placeholderStart: string
  placeholderMiddle: string
  placeholderEnd: string
}

export function getUnifiedHomePalette(colors: ColorTokens): UnifiedHomePalette {
  if (colors.mode === 'light') {
    return {
      base: UNIFIED_HOME_LIGHT_BASE_COLOR,
      text: palette.neutral900,
      textSecondary: palette.neutral700,
      textMuted: palette.neutral500,
      textSubtle: palette.neutral500,
      accent: palette.cyanDark,
      accentSurface: palette.homeLightAccentSurface,
      danger: palette.crimsonDark,
      surface: UNIFIED_HOME_LIGHT_SURFACE_COLOR,
      surfaceMuted: UNIFIED_HOME_LIGHT_SURFACE_MUTED_COLOR,
      border: palette.lineLight,
      buttonSurface: UNIFIED_HOME_LIGHT_SURFACE_COLOR,
      buttonBorder: palette.lineLight,
      coverStart: palette.homeLightCoverStart,
      coverMiddle: UNIFIED_HOME_LIGHT_BASE_COLOR,
      placeholderStart: palette.homeLightPlaceholderStart,
      placeholderMiddle: UNIFIED_HOME_LIGHT_BASE_COLOR,
      placeholderEnd: UNIFIED_HOME_LIGHT_BASE_COLOR,
    }
  }

  return {
    base: UNIFIED_HOME_DARK_BASE_COLOR,
    text: UNIFIED_HOME_TEXT_COLOR,
    textSecondary: UNIFIED_HOME_TEXT_SECONDARY_COLOR,
    textMuted: UNIFIED_HOME_TEXT_MUTED_COLOR,
    textSubtle: palette.neutral500,
    accent: UNIFIED_HOME_ACCENT_COLOR,
    accentSurface: UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR,
    danger: UNIFIED_HOME_DANGER_COLOR,
    surface: UNIFIED_HOME_DARK_SURFACE_COLOR,
    surfaceMuted: UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR,
    border: UNIFIED_HOME_BORDER_COLOR,
    buttonSurface: UNIFIED_HOME_DARK_SURFACE_COLOR,
    buttonBorder: UNIFIED_HOME_BORDER_COLOR,
    coverStart: UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR,
    coverMiddle: UNIFIED_HOME_DARK_SURFACE_COLOR,
    placeholderStart: palette.homeDarkPlaceholderStart,
    placeholderMiddle: UNIFIED_HOME_DARK_SURFACE_COLOR,
    placeholderEnd: UNIFIED_HOME_DARK_BASE_COLOR,
  }
}

export function useUnifiedHomePalette() {
  return getUnifiedHomePalette(useColors())
}
