import type { BattleResultReason } from './types.js'

export function battleResultReasonLabel(reason: BattleResultReason) {
  switch (reason) {
    case 'hit':
      return 'knockout'
    case 'crashed':
      return 'crashed'
    case 'stars':
      return 'star control'
    case 'flags':
      return 'flag control'
    case 'runtime':
      return 'runtime advantage'
    case 'draw':
      return 'draw'
  }
}
