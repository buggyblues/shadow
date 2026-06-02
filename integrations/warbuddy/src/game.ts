import { runRealtimeBattle } from './realtime-battle.js'
import type { BattleReplay, RunBattleInput } from './types.js'

export { BATTLE_MAPS, parseBattleMap } from './battle-maps.js'
export { battleResultReasonLabel } from './battle-result.js'
export { BATTLE_SYSTEM_NAMES } from './battle-systems.js'
export {
  DEFAULT_GAME_FPS,
  DEFAULT_MATCH_DURATION_SECONDS,
  DEFAULT_WARBUDDY_RULES,
} from './rules.js'
export type { RunBattleInput } from './types.js'

export { runRealtimeBattle }
export type RealtimeBattleReplay = BattleReplay
export type RealtimeBattleInput = RunBattleInput
