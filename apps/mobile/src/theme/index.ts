import { useUIStore } from '../stores/ui.store'
import { type ColorTokens, darkColors, lightColors } from './tokens'

export type { ColorTokens } from './tokens'
export {
  border,
  fontSize,
  iconSize,
  letterSpacing,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
} from './tokens'

export function useColors(): ColorTokens {
  const effectiveTheme = useUIStore((s) => s.effectiveTheme)
  return effectiveTheme === 'light' ? lightColors : darkColors
}
