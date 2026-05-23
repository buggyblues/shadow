import type {
  AdventureMap,
  CatRoute,
  CatStatKey,
  CatStats,
  DailyLimitedAction,
  DailyTask,
  FurnitureUpgrade,
  RouteDefinition,
} from './types.js'

export const STARTING_COINS = 600
export const HEALTH_FLOOR = 15
export const FURNITURE_BONUS_CAP = 0.25

export const DAILY_ACTION_LIMITS: Record<DailyLimitedAction, number> = {
  feed: 3,
  pet: 5,
  play: 3,
  clean: 3,
  rest: 3,
  train: 4,
  minigame: 5,
  adventure: 2,
  upgrade_furniture: 1,
}

export const SCORE_CAPS = {
  bond: 1200,
  stat: 180,
  coins: 8000,
  materials: 2600,
} as const

export const STAT_KEYS: CatStatKey[] = ['str', 'agi', 'int', 'cha', 'luk']

export const BASE_STATS: CatStats = {
  str: 12,
  agi: 12,
  int: 12,
  cha: 12,
  luk: 12,
}

export const ROUTES: RouteDefinition[] = [
  {
    id: 'str',
    label: '力量',
    shortLabel: 'STR',
    description: '训练爆发力，水晶洞穴成功率更稳。',
    color: '#ff6b5f',
  },
  {
    id: 'agi',
    label: '敏捷',
    shortLabel: 'AGI',
    description: '提高闪避和反应，糖果森林、云端剧场更吃香。',
    color: '#35b7ff',
  },
  {
    id: 'int',
    label: '智慧',
    shortLabel: 'INT',
    description: '适合解谜和观测，水晶洞穴收益更高。',
    color: '#7b61ff',
  },
  {
    id: 'cha',
    label: '魅力',
    shortLabel: 'CHA',
    description: '社交和舞台路线，云端剧场表现最好。',
    color: '#ff7ab6',
  },
  {
    id: 'luk',
    label: '幸运',
    shortLabel: 'LUK',
    description: '提高稀有掉落期望，训练经验略高。',
    color: '#ffc857',
  },
  {
    id: 'balanced',
    label: '均衡',
    shortLabel: 'ALL',
    description: '五维同步成长，地图成功率额外补偿。',
    color: '#47d7ac',
  },
]

export const EXP_TO_NEXT = [
  0, 60, 80, 105, 135, 170, 210, 255, 305, 360, 420, 485, 555, 630, 710, 795, 885, 980, 1080, 1185,
  1295, 1410, 1530, 1655, 1785, 1920, 2060, 2205, 2355, 2510,
]

export const ACTION_BALANCE = {
  feed: {
    costCoin: 60,
    hungerDelta: -38,
    happinessDelta: 3,
  },
  clean: {
    costCoin: 45,
    cleanlinessDelta: 50,
    happinessDelta: -2,
  },
  pet: {
    happinessDelta: 12,
    bond: 6,
  },
  play: {
    costEnergy: 10,
    happinessDelta: 14,
    bond: 9,
    exp: 20,
  },
  rest: {
    hungerDelta: 4,
    energyDelta: 36,
    cleanlinessDelta: -3,
  },
  train: {
    costCoin: 50,
    costEnergy: 15,
    exp: 45,
    luckExp: 50,
    bond: 3,
  },
  minigame: {
    costEnergy: 5,
  },
} as const

export const MINIGAME_RANKS = {
  B: { rank: 'B', happinessDelta: 8, bond: 3, exp: 30, coins: 45 },
  A: { rank: 'A', happinessDelta: 12, bond: 5, exp: 45, coins: 80 },
  S: { rank: 'S', happinessDelta: 18, bond: 8, exp: 60, coins: 130 },
} as const

export const ADVENTURE_MAPS: AdventureMap[] = [
  {
    id: 1,
    name: '星光草地',
    unlockLevel: 1,
    costEnergy: 20,
    difficulty: 20,
    recommendAttrs: ['str', 'agi', 'int', 'cha', 'luk'],
    baseCoin: 100,
    baseExp: 35,
    materialValue: 20,
    rareRate: 0.05,
    rareValue: 160,
  },
  {
    id: 2,
    name: '糖果森林',
    unlockLevel: 5,
    costEnergy: 25,
    difficulty: 40,
    recommendAttrs: ['agi', 'luk'],
    baseCoin: 180,
    baseExp: 50,
    materialValue: 45,
    rareRate: 0.08,
    rareValue: 220,
  },
  {
    id: 3,
    name: '水晶洞穴',
    unlockLevel: 10,
    costEnergy: 30,
    difficulty: 65,
    recommendAttrs: ['str', 'int'],
    baseCoin: 260,
    baseExp: 70,
    materialValue: 70,
    rareRate: 0.1,
    rareValue: 300,
  },
  {
    id: 4,
    name: '云端剧场',
    unlockLevel: 15,
    costEnergy: 35,
    difficulty: 90,
    recommendAttrs: ['cha', 'agi'],
    baseCoin: 350,
    baseExp: 90,
    materialValue: 95,
    rareRate: 0.08,
    rareValue: 360,
  },
  {
    id: 5,
    name: '遗忘星港',
    unlockLevel: 25,
    costEnergy: 45,
    difficulty: 130,
    recommendAttrs: ['str', 'agi', 'int', 'cha', 'luk'],
    baseCoin: 500,
    baseExp: 130,
    materialValue: 140,
    rareRate: 0.05,
    rareValue: 700,
  },
]

export const DAILY_TASKS: DailyTask[] = [
  {
    id: 1,
    label: '完成 1 个核心行为',
    requiredActions: 1,
    rewardCoin: 120,
    rewardExp: 50,
    rewardBond: 5,
    designGoal: '轻度玩家也能获得回报',
  },
  {
    id: 2,
    label: '完成 2 个核心行为',
    requiredActions: 2,
    rewardCoin: 280,
    rewardExp: 120,
    rewardBond: 10,
    designGoal: '形成半循环',
  },
  {
    id: 3,
    label: '完成 3 个核心行为',
    requiredActions: 3,
    rewardCoin: 450,
    rewardExp: 220,
    rewardBond: 15,
    designGoal: '训练 + 小游戏 + 探险',
  },
  {
    id: 4,
    label: '完成 5 个行动',
    requiredActions: 5,
    rewardCoin: 600,
    rewardExp: 350,
    rewardBond: 20,
    designGoal: '每日完整闭环',
  },
  {
    id: 5,
    label: '完成 8 个行动',
    requiredActions: 8,
    rewardCoin: 0,
    rewardExp: 140,
    rewardBond: 5,
    designGoal: '深度会话奖励，不增加金币通胀',
  },
  {
    id: 6,
    label: '完成 10 个行动',
    requiredActions: 10,
    rewardCoin: 0,
    rewardExp: 80,
    rewardBond: 5,
    designGoal: '重度玩家进度承接',
  },
]

export const FURNITURE_UPGRADES: FurnitureUpgrade[] = [
  { level: 1, name: '星铃软垫', cost: 180, bonus: 0.05 },
  { level: 2, name: '训练地毯', cost: 420, bonus: 0.1 },
  { level: 3, name: '月光浴桶', cost: 780, bonus: 0.15 },
  { level: 4, name: '占星地图墙', cost: 1250, bonus: 0.2 },
  { level: 5, name: '星港小屋', cost: 1900, bonus: 0.25 },
]

export function routeLabel(route: CatRoute) {
  return ROUTES.find((item) => item.id === route)?.label ?? '均衡'
}
