// ══════════════════════════════════════════════════════════════
// Resource — Animation Scheduler
//
// Owns animation frame budgets for dynamic card content. Animation runtimes
// ask this scheduler before doing CPU/GPU work so GIF/Lottie/Three/Live2D
// cannot all stampede the same frame.
// ══════════════════════════════════════════════════════════════

export type AnimationRuntimeKind = 'gif' | 'lottie' | 'three' | 'live2d'

export interface AnimationSchedulerBudget {
  maxTicksPerFrame: number
  maxThreeTicksPerFrame: number
  maxLive2DTicksPerFrame: number
  maxFrameMarksPerFrame: number
  hoveredFps: Partial<Record<AnimationRuntimeKind, number>>
  autoplayFps: Partial<Record<AnimationRuntimeKind, number>>
}

export interface AnimationTickRequest {
  cardId: string
  kind: AnimationRuntimeKind
  hovered: boolean
  autoplay: boolean
  timestamp: number
}

export interface AnimationSchedulerFrame {
  frameId: number
  timestamp: number
  usedTicks: number
  usedThreeTicks: number
  usedLive2DTicks: number
  usedFrameMarks: number
  skippedTicks: number
}

export interface AnimationSchedulerStats {
  frame: AnimationSchedulerFrame
  budget: AnimationSchedulerBudget
}

const DEFAULT_BUDGET: AnimationSchedulerBudget = {
  maxTicksPerFrame: 24,
  maxThreeTicksPerFrame: 4,
  maxLive2DTicksPerFrame: 3,
  maxFrameMarksPerFrame: 18,
  hoveredFps: {
    gif: 24,
    lottie: 30,
    three: 30,
    live2d: 12,
  },
  autoplayFps: {
    gif: 12,
    lottie: 18,
    three: 24,
    live2d: 8,
  },
}

export class AnimationScheduler {
  private budget: AnimationSchedulerBudget = cloneBudget(DEFAULT_BUDGET)
  private frame: AnimationSchedulerFrame = {
    frameId: 0,
    timestamp: 0,
    usedTicks: 0,
    usedThreeTicks: 0,
    usedLive2DTicks: 0,
    usedFrameMarks: 0,
    skippedTicks: 0,
  }
  private lastTickAt = new Map<string, number>()
  private tickedThisFrame = new Set<string>()

  configure(budget: Partial<AnimationSchedulerBudget>): void {
    this.budget = {
      ...this.budget,
      ...budget,
      hoveredFps: { ...this.budget.hoveredFps, ...budget.hoveredFps },
      autoplayFps: { ...this.budget.autoplayFps, ...budget.autoplayFps },
    }
    this.budget.maxTicksPerFrame = Math.max(1, this.budget.maxTicksPerFrame)
    this.budget.maxThreeTicksPerFrame = Math.max(0, this.budget.maxThreeTicksPerFrame)
    this.budget.maxLive2DTicksPerFrame = Math.max(0, this.budget.maxLive2DTicksPerFrame)
    this.budget.maxFrameMarksPerFrame = Math.max(1, this.budget.maxFrameMarksPerFrame)
  }

  beginFrame(timestamp: number): AnimationSchedulerFrame {
    this.frame = {
      frameId: this.frame.frameId + 1,
      timestamp,
      usedTicks: 0,
      usedThreeTicks: 0,
      usedLive2DTicks: 0,
      usedFrameMarks: 0,
      skippedTicks: 0,
    }
    this.tickedThisFrame.clear()
    return this.frame
  }

  shouldTick(request: AnimationTickRequest): boolean {
    if (!request.hovered && !request.autoplay) return false
    const key = `${request.kind}:${request.cardId}`
    if (this.tickedThisFrame.has(key)) return false

    if (this.frame.usedTicks >= this.budget.maxTicksPerFrame) {
      this.skip()
      return false
    }
    if (
      request.kind === 'three' &&
      this.frame.usedThreeTicks >= this.budget.maxThreeTicksPerFrame
    ) {
      this.skip()
      return false
    }
    if (
      request.kind === 'live2d' &&
      this.frame.usedLive2DTicks >= this.budget.maxLive2DTicksPerFrame
    ) {
      this.skip()
      return false
    }

    const fps = this.targetFps(request.kind, request.hovered)
    const minDelta = 1000 / fps
    const last = this.lastTickAt.get(key) ?? -Infinity
    if (request.timestamp - last < minDelta) return false

    this.lastTickAt.set(key, request.timestamp)
    this.tickedThisFrame.add(key)
    this.frame.usedTicks += 1
    if (request.kind === 'three') this.frame.usedThreeTicks += 1
    if (request.kind === 'live2d') this.frame.usedLive2DTicks += 1
    return true
  }

  shouldMarkFrame(request: AnimationTickRequest): boolean {
    if (!request.hovered && !request.autoplay) return false
    if (this.frame.usedFrameMarks >= this.budget.maxFrameMarksPerFrame) {
      this.skip()
      return false
    }

    const key = `mark:${request.kind}:${request.cardId}`
    const fps = this.targetFps(request.kind, request.hovered)
    const minDelta = 1000 / fps
    const last = this.lastTickAt.get(key) ?? -Infinity
    if (request.timestamp - last < minDelta) return false

    this.lastTickAt.set(key, request.timestamp)
    this.frame.usedFrameMarks += 1
    return true
  }

  getStats(): AnimationSchedulerStats {
    return {
      frame: { ...this.frame },
      budget: cloneBudget(this.budget),
    }
  }

  resetCard(cardId: string): void {
    for (const key of [...this.lastTickAt.keys()]) {
      if (key.endsWith(`:${cardId}`)) this.lastTickAt.delete(key)
    }
  }

  reset(): void {
    this.budget = cloneBudget(DEFAULT_BUDGET)
    this.lastTickAt.clear()
    this.tickedThisFrame.clear()
  }

  private targetFps(kind: AnimationRuntimeKind, hovered: boolean): number {
    const table = hovered ? this.budget.hoveredFps : this.budget.autoplayFps
    return Math.max(1, table[kind] ?? (hovered ? 24 : 12))
  }

  private skip(): void {
    this.frame.skippedTicks += 1
  }
}

function cloneBudget(budget: AnimationSchedulerBudget): AnimationSchedulerBudget {
  return {
    ...budget,
    hoveredFps: { ...budget.hoveredFps },
    autoplayFps: { ...budget.autoplayFps },
  }
}

export const animationScheduler = new AnimationScheduler()
