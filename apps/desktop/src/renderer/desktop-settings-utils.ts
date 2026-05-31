import type { DesktopShortcutAction } from './desktop-settings-types'

export const shortcutActions: DesktopShortcutAction[] = [
  'openCommunity',
  'togglePet',
  'petVoice',
  'petChat',
  'showNotifications',
]

export function displayShortcut(value: string, platform: string | undefined): string {
  const isMac = platform === 'darwin'
  const parts = value.split('+').filter(Boolean)
  const labels = parts.map((part) => {
    if (part === 'CommandOrControl') return isMac ? '⌘' : 'Ctrl'
    if (part === 'Command') return isMac ? '⌘' : 'Win'
    if (part === 'Control') return isMac ? '⌃' : 'Ctrl'
    if (part === 'Alt') return isMac ? '⌥' : 'Alt'
    if (part === 'Shift') return isMac ? '⇧' : 'Shift'
    if (part === 'Space') return 'Space'
    return part.replace(/^Arrow/, '')
  })
  return isMac ? labels.join('') : labels.join(' + ')
}

export function shortcutFromKeyboardEvent(
  event: KeyboardEvent,
  platform: string | undefined,
): string | null {
  const key = event.key
  if (!key || ['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null
  const parts: string[] = []
  if (platform === 'darwin') {
    if (event.metaKey) parts.push('CommandOrControl')
    else if (event.ctrlKey) parts.push('Control')
  } else if (event.ctrlKey || event.metaKey) {
    parts.push('CommandOrControl')
  }
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (parts.length === 0) return null
  const normalizedKey =
    key === ' '
      ? 'Space'
      : key.startsWith('Arrow')
        ? key
        : key.length === 1
          ? key.toUpperCase()
          : key
  parts.push(normalizedKey)
  return parts.join('+')
}
