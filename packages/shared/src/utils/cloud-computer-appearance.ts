export const CLOUD_COMPUTER_SHELL_COLORS = [
  'aqua',
  'grape',
  'tangerine',
  'lime',
  'strawberry',
  'blueberry',
  'graphite',
] as const

export type CloudComputerShellColor = (typeof CLOUD_COMPUTER_SHELL_COLORS)[number]

export const CLOUD_COMPUTER_SHELL_PALETTE: Record<
  CloudComputerShellColor,
  { shell: string; deep: string; glow: string; highlight: string }
> = {
  aqua: { shell: '#43D7D1', deep: '#087B83', glow: '#BFFFF7', highlight: '#E9FFFC' },
  grape: { shell: '#A978E8', deep: '#59349A', glow: '#E7D4FF', highlight: '#F8F1FF' },
  tangerine: { shell: '#FF9A3D', deep: '#B94F12', glow: '#FFD7A8', highlight: '#FFF3E4' },
  lime: { shell: '#A7D83E', deep: '#527B13', glow: '#E4F6A8', highlight: '#F8FFE5' },
  strawberry: { shell: '#F76F96', deep: '#A92C58', glow: '#FFD0DF', highlight: '#FFF0F5' },
  blueberry: { shell: '#5B8FF4', deep: '#2853A6', glow: '#C9DBFF', highlight: '#EFF5FF' },
  graphite: { shell: '#7D8999', deep: '#343C48', glow: '#D6DEE8', highlight: '#F1F4F8' },
}

export function isCloudComputerShellColor(value: unknown): value is CloudComputerShellColor {
  return (
    typeof value === 'string' && (CLOUD_COMPUTER_SHELL_COLORS as readonly string[]).includes(value)
  )
}

export function defaultCloudComputerShellColor(seed: string): CloudComputerShellColor {
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return CLOUD_COMPUTER_SHELL_COLORS[hash % CLOUD_COMPUTER_SHELL_COLORS.length] ?? 'aqua'
}

export function resolveCloudComputerShellColor(
  value: unknown,
  seed: string,
): CloudComputerShellColor {
  return isCloudComputerShellColor(value) ? value : defaultCloudComputerShellColor(seed)
}
