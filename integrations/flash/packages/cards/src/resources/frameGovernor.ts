export interface FrameGovernorOptions {
  /** Fixed physics step in milliseconds. Defaults to 60Hz. */
  fixedStepMs: number
  /** Maximum fixed steps to run on one render frame. */
  maxSubSteps: number
  /** Maximum accumulated time before dropping the oldest backlog. */
  maxAccumulatedMs: number
}

export interface FrameGovernorTick {
  deltaMs: number
  fixedStepMs: number
  physicsSteps: number
  droppedMs: number
}

const DEFAULTS: FrameGovernorOptions = {
  fixedStepMs: 1000 / 60,
  maxSubSteps: 3,
  maxAccumulatedMs: 1000 / 10,
}

export class FrameGovernor {
  private readonly options: FrameGovernorOptions
  private lastTimeMs = -1
  private accumulatorMs = 0

  constructor(options: Partial<FrameGovernorOptions> = {}) {
    this.options = { ...DEFAULTS, ...options }
  }

  reset(timeMs = -1): void {
    this.lastTimeMs = timeMs
    this.accumulatorMs = 0
  }

  next(timeMs: number): FrameGovernorTick {
    if (this.lastTimeMs < 0) {
      this.lastTimeMs = timeMs
      return {
        deltaMs: 0,
        fixedStepMs: this.options.fixedStepMs,
        physicsSteps: 0,
        droppedMs: 0,
      }
    }

    const rawDeltaMs = Math.max(0, timeMs - this.lastTimeMs)
    this.lastTimeMs = timeMs
    this.accumulatorMs += rawDeltaMs

    let droppedMs = 0
    if (this.accumulatorMs > this.options.maxAccumulatedMs) {
      droppedMs = this.accumulatorMs - this.options.maxAccumulatedMs
      this.accumulatorMs = this.options.maxAccumulatedMs
    }

    let physicsSteps = 0
    while (
      this.accumulatorMs >= this.options.fixedStepMs &&
      physicsSteps < this.options.maxSubSteps
    ) {
      this.accumulatorMs -= this.options.fixedStepMs
      physicsSteps += 1
    }

    if (this.accumulatorMs >= this.options.fixedStepMs) {
      droppedMs += this.accumulatorMs
      this.accumulatorMs = 0
    }

    return {
      deltaMs: rawDeltaMs,
      fixedStepMs: this.options.fixedStepMs,
      physicsSteps,
      droppedMs,
    }
  }
}
