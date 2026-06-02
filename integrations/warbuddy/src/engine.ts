import type { WarbuddyRules } from './rules.js'

export type GameObjectKind = 'tank' | 'engineer' | 'bullet' | 'bomb' | 'explosion' | 'pickup'
export type GameObjectComponents = Record<string, unknown>

export interface GameObjectSnapshot {
  id: string
  kind: GameObjectKind
  owner: number | null
  createdFrame: number
  componentKeys: string[]
}

export class GameObject {
  readonly id: string
  readonly kind: GameObjectKind
  readonly owner: number | null
  readonly createdFrame: number
  private readonly components = new Map<string, unknown>()

  constructor(input: GameObjectSnapshot) {
    this.id = input.id
    this.kind = input.kind
    this.owner = input.owner
    this.createdFrame = input.createdFrame
  }

  setComponent<TValue>(key: string, value: TValue) {
    this.components.set(key, value)
    return this
  }

  setComponents(values: GameObjectComponents = {}) {
    for (const [key, value] of Object.entries(values)) this.setComponent(key, value)
    return this
  }

  getComponent<TValue>(key: string) {
    return this.components.get(key) as TValue | undefined
  }

  hasComponent(key: string) {
    return this.components.has(key)
  }

  removeComponent(key: string) {
    return this.components.delete(key)
  }

  snapshot(): GameObjectSnapshot {
    return {
      id: this.id,
      kind: this.kind,
      owner: this.owner,
      createdFrame: this.createdFrame,
      componentKeys: [...this.components.keys()],
    }
  }
}

export class GameObjectRegistry {
  private readonly objects = new Map<string, GameObject>()
  private readonly idCounts = new Map<string, number>()

  constructor(private readonly rng: () => number) {}

  nextId(kind: GameObjectKind) {
    const count = (this.idCounts.get(kind) ?? 0) + 1
    this.idCounts.set(kind, count)
    const nonce = Math.floor(this.rng() * 0xffffffff)
      .toString(16)
      .padStart(8, '0')
    return `${kind}_${count}_${nonce}`
  }

  add(
    input: Omit<GameObjectSnapshot, 'id' | 'componentKeys'> & {
      id?: string
      components?: GameObjectComponents
    },
  ) {
    const object = new GameObject({
      id: input.id ?? this.nextId(input.kind),
      kind: input.kind,
      owner: input.owner,
      createdFrame: input.createdFrame,
      componentKeys: [],
    }).setComponents(input.components)
    this.objects.set(object.id, object)
    return object
  }

  get(id: string) {
    return this.objects.get(id) ?? null
  }

  remove(id: string) {
    this.objects.delete(id)
  }

  byKind(kind: GameObjectKind) {
    return [...this.objects.values()].filter((object) => object.kind === kind)
  }

  snapshot() {
    return [...this.objects.values()].map((object) => object.snapshot())
  }
}

export class GameClock {
  readonly fps: number
  readonly maxFrames: number
  readonly durationSeconds: number
  readonly frameMs: number

  constructor(input: { fps: number; maxFrames: number }) {
    this.fps = input.fps
    this.maxFrames = input.maxFrames
    this.durationSeconds = input.maxFrames / input.fps
    this.frameMs = 1000 / input.fps
  }
}

export class GameWorld {
  readonly objects: GameObjectRegistry

  constructor(
    readonly rules: WarbuddyRules,
    readonly clock: GameClock,
    rng: () => number,
  ) {
    this.objects = new GameObjectRegistry(rng)
  }

  nextObjectId(kind: GameObjectKind) {
    return this.objects.nextId(kind)
  }

  addObject(
    input: Omit<GameObjectSnapshot, 'id' | 'componentKeys'> & {
      id?: string
      components?: GameObjectComponents
    },
  ) {
    return this.objects.add(input)
  }
}

export interface GameSystem<TWorld = GameWorld> {
  readonly name: string
  enabled?(world: TWorld): boolean
  tick(world: TWorld): void
  stopAfterTick?(world: TWorld): boolean
}

export interface GameLoopWorld {
  readonly clock: GameClock
  beginFrame(frame: number): void
}

export class GameEngine<TWorld extends GameLoopWorld> {
  constructor(readonly systems: ReadonlyArray<GameSystem<TWorld>>) {}

  run(world: TWorld) {
    for (let frame = 0; frame < world.clock.maxFrames; frame += 1) {
      if (!this.runFrame(world, frame)) break
    }
  }

  runFrame(world: TWorld, frame: number) {
    world.beginFrame(frame)
    for (const system of this.systems) {
      if (system.enabled && !system.enabled(world)) continue
      system.tick(world)
      if (system.stopAfterTick?.(world)) return false
    }
    return true
  }
}
