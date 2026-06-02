export const BATTLE_SYSTEM_NAMES = [
  'input',
  'strategy',
  'command',
  'motion',
  'combat',
  'objective',
  'settlement',
  'recording',
] as const

export type BattleSystemName = (typeof BATTLE_SYSTEM_NAMES)[number]
