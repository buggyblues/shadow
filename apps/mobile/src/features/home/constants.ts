import { Hash, Megaphone, Volume2 } from 'lucide-react-native'
import { border, palette, size, spacing } from '../../theme'

export const HOME_VARIANT_STORAGE_KEY = 'mobileHomeVariant'

export const CHANNEL_TYPE_ICONS = {
  announcement: Megaphone,
  text: Hash,
  voice: Volume2,
} as const

export const UNIFIED_HEADER_COVER_EXTRA_HEIGHT = spacing['4xl']
export const UNIFIED_HOME_LIGHT_BASE_COLOR = palette.homeLightBase
export const UNIFIED_HOME_LIGHT_SURFACE_COLOR = palette.white
export const UNIFIED_HOME_LIGHT_SURFACE_MUTED_COLOR = palette.homeLightSurfaceMuted
export const UNIFIED_HOME_DARK_BASE_COLOR = palette.homeDarkBase
export const UNIFIED_HOME_DARK_SURFACE_COLOR = palette.homeDarkSurface
export const UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR = palette.homeDarkSurfaceMuted
export const UNIFIED_HOME_BASE_COLOR = UNIFIED_HOME_DARK_BASE_COLOR
export const UNIFIED_HOME_TEXT_COLOR = palette.neutral50
export const UNIFIED_HOME_TEXT_SECONDARY_COLOR = palette.neutral300
export const UNIFIED_HOME_TEXT_MUTED_COLOR = palette.neutral400
export const UNIFIED_HOME_ACCENT_COLOR = palette.cyan
export const UNIFIED_HOME_DANGER_COLOR = palette.crimson
export const UNIFIED_HOME_SURFACE_COLOR = UNIFIED_HOME_DARK_SURFACE_COLOR
export const UNIFIED_HOME_SURFACE_MUTED_COLOR = UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR
export const UNIFIED_HOME_BORDER_COLOR = palette.lineDark
export const UNIFIED_CREATE_MENU_ARROW_SIZE = spacing.md
export const UNIFIED_CREATE_MENU_POINTER_SIZE = spacing.lg
export const UNIFIED_CREATE_MENU_WIDTH = size.actionMinWidth
export const UNIFIED_CHANNEL_LIST_PADDING = spacing.sm
export const UNIFIED_CHANNEL_ROW_PADDING = spacing.md
export const UNIFIED_CHANNEL_ICON_TILE_SIZE = size.controlXs
export const UNIFIED_HEADER_SERVER_ICON_SIZE = size.plusPanelIcon
export const UNIFIED_HOME_SECTION_GAP = spacing.md
export const UNIFIED_CHANNEL_ICON_AXIS =
  UNIFIED_CHANNEL_LIST_PADDING + UNIFIED_CHANNEL_ROW_PADDING + UNIFIED_CHANNEL_ICON_TILE_SIZE / 2
export const UNIFIED_HEADER_LEFT_PADDING =
  UNIFIED_CHANNEL_ICON_AXIS - UNIFIED_HEADER_SERVER_ICON_SIZE / 2
export const UNIFIED_SHORTCUT_ICON_AXIS = UNIFIED_CHANNEL_ICON_AXIS
export const UNIFIED_ACTIVE_SERVER_BORDER_WIDTH = border.active
