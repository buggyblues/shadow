import type { GameObject, GameWorld } from './engine.js'
import type { WarbuddyRules } from './rules.js'
import type { Direction, SkillType, TankProfile } from './types.js'

export const WARBUDDY_COMPONENTS = {
  transform: 'transform',
  unit: 'unit',
  combat: 'combat',
  strategy: 'strategy',
  projectile: 'projectile',
  explosive: 'explosive',
  lifetime: 'lifetime',
} as const

export interface TransformComponent {
  position: [number, number]
  direction?: Direction
  headingDegrees?: number
}

export interface UnitComponent {
  role: 'tank' | 'engineer'
  owner: number
  displayName: string
}

export interface CombatComponent {
  hitRadius?: number
  crushRadius?: number
  armor?: number
}

export interface StrategyComponent {
  skillType: SkillType
  hasBuddyStrategy: boolean
}

export interface ProjectileComponent {
  direction: Direction
  headingDegrees?: number
}

export interface ExplosiveComponent {
  range: number
  fuseFrames?: number
}

export interface LifetimeComponent {
  remainingFrames: number
}

export function createTankObject(
  world: GameWorld,
  input: {
    owner: number
    createdFrame: number
    profile: Pick<TankProfile, 'id' | 'name' | 'skillType' | 'code'>
    position: [number, number]
    direction: Direction
    hasBuddyStrategy: boolean
    rules: WarbuddyRules
  },
) {
  return world.addObject({
    kind: 'tank',
    owner: input.owner,
    createdFrame: input.createdFrame,
    components: {
      [WARBUDDY_COMPONENTS.transform]: {
        position: [...input.position],
        direction: input.direction,
      } satisfies TransformComponent,
      [WARBUDDY_COMPONENTS.unit]: {
        role: 'tank',
        owner: input.owner,
        displayName: input.profile.name,
      } satisfies UnitComponent,
      [WARBUDDY_COMPONENTS.combat]: {
        hitRadius: input.rules.units.tank.hitRadius,
        crushRadius: input.rules.units.tank.crushRadius,
        armor: input.rules.units.tank.initialArmor,
      } satisfies CombatComponent,
      [WARBUDDY_COMPONENTS.strategy]: {
        skillType: input.profile.skillType,
        hasBuddyStrategy: input.hasBuddyStrategy,
      } satisfies StrategyComponent,
    },
  })
}

export function createEngineerObject(
  world: GameWorld,
  input: {
    owner: number
    createdFrame: number
    displayName: string
    position: [number, number]
    direction: Direction
    headingDegrees: number
    rules: WarbuddyRules
  },
) {
  return world.addObject({
    kind: 'engineer',
    owner: input.owner,
    createdFrame: input.createdFrame,
    components: {
      [WARBUDDY_COMPONENTS.transform]: {
        position: [...input.position],
        direction: input.direction,
        headingDegrees: input.headingDegrees,
      } satisfies TransformComponent,
      [WARBUDDY_COMPONENTS.unit]: {
        role: 'engineer',
        owner: input.owner,
        displayName: input.displayName,
      } satisfies UnitComponent,
      [WARBUDDY_COMPONENTS.combat]: {
        hitRadius: input.rules.units.engineer.hitRadius,
      } satisfies CombatComponent,
      [WARBUDDY_COMPONENTS.explosive]: {
        range: input.rules.units.engineer.initialBombRange,
      } satisfies ExplosiveComponent,
    },
  })
}

export function createBulletObject(
  world: GameWorld,
  input: {
    owner: number
    createdFrame: number
    position: [number, number]
    direction: Direction
    headingDegrees?: number
  },
) {
  return world.addObject({
    kind: 'bullet',
    owner: input.owner,
    createdFrame: input.createdFrame,
    components: {
      [WARBUDDY_COMPONENTS.transform]: {
        position: [...input.position],
        direction: input.direction,
        headingDegrees: input.headingDegrees,
      } satisfies TransformComponent,
      [WARBUDDY_COMPONENTS.projectile]: {
        direction: input.direction,
        headingDegrees: input.headingDegrees,
      } satisfies ProjectileComponent,
    },
  })
}

export function createBombObject(
  world: GameWorld,
  input: {
    owner: number
    createdFrame: number
    position: [number, number]
    range: number
    fuseFrames: number
  },
) {
  return world.addObject({
    kind: 'bomb',
    owner: input.owner,
    createdFrame: input.createdFrame,
    components: {
      [WARBUDDY_COMPONENTS.transform]: {
        position: [...input.position],
      } satisfies TransformComponent,
      [WARBUDDY_COMPONENTS.explosive]: {
        range: input.range,
        fuseFrames: input.fuseFrames,
      } satisfies ExplosiveComponent,
      [WARBUDDY_COMPONENTS.lifetime]: {
        remainingFrames: input.fuseFrames,
      } satisfies LifetimeComponent,
    },
  })
}

export function createExplosionObject(
  world: GameWorld,
  input: {
    id?: string
    owner: number
    createdFrame: number
    positions: Array<[number, number]>
    ttlFrames: number
  },
) {
  return world.addObject({
    id: input.id,
    kind: 'explosion',
    owner: input.owner,
    createdFrame: input.createdFrame,
    components: {
      [WARBUDDY_COMPONENTS.explosive]: {
        range: input.positions.length,
      } satisfies ExplosiveComponent,
      [WARBUDDY_COMPONENTS.lifetime]: {
        remainingFrames: input.ttlFrames,
      } satisfies LifetimeComponent,
    },
  })
}

export function syncTransform(
  object: GameObject | null,
  position: [number, number],
  direction?: Direction,
  headingDegrees?: number,
) {
  object?.setComponent(WARBUDDY_COMPONENTS.transform, {
    position: [...position],
    direction,
    headingDegrees,
  } satisfies TransformComponent)
}
