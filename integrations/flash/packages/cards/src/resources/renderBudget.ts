export type RenderQualityTier = 'ultra' | 'high' | 'balanced' | 'recovery'

export interface RenderBudgetFrameMetrics {
  frameMs: number
  physicsMs: number
  renderMs: number
  cardCount: number
  physicsSteps: number
  droppedMs: number
}

export interface RenderBudgetRecommendation {
  qualityTier: RenderQualityTier
  textureUploadMaxUploads: number
  textureUploadMaxBytes: number
  animationMaxTicks: number
  animationMaxThreeTicks: number
  animationMaxLive2DTicks: number
  animationMaxFrameMarks: number
}

export interface RenderBudgetStats extends RenderBudgetRecommendation {
  targetFrameMs: number
  lastFrameMs: number
  frameP95Ms: number
  overBudgetFrames: number
  sampleCount: number
}

const DEFAULT_TARGET_FRAME_MS = 16.7
const SAMPLE_LIMIT = 180

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function percentile(values: number[], pct: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = clamp(Math.ceil((pct / 100) * sorted.length) - 1, 0, sorted.length - 1)
  return sorted[index]
}

function recommendationsFor(
  tier: RenderQualityTier,
  cardCount: number,
): RenderBudgetRecommendation {
  const densityPenalty = cardCount > 1000 ? 0.5 : cardCount > 500 ? 0.75 : 1
  if (tier === 'recovery') {
    return {
      qualityTier: tier,
      textureUploadMaxUploads: 2,
      textureUploadMaxBytes: 4 * 1024 * 1024,
      animationMaxTicks: Math.max(4, Math.floor(8 * densityPenalty)),
      animationMaxThreeTicks: Math.max(0, Math.floor(1 * densityPenalty)),
      animationMaxLive2DTicks: Math.max(0, Math.floor(1 * densityPenalty)),
      animationMaxFrameMarks: Math.max(4, Math.floor(8 * densityPenalty)),
    }
  }
  if (tier === 'balanced') {
    return {
      qualityTier: tier,
      textureUploadMaxUploads: 4,
      textureUploadMaxBytes: 10 * 1024 * 1024,
      animationMaxTicks: Math.max(8, Math.floor(16 * densityPenalty)),
      animationMaxThreeTicks: Math.max(1, Math.floor(2 * densityPenalty)),
      animationMaxLive2DTicks: Math.max(1, Math.floor(2 * densityPenalty)),
      animationMaxFrameMarks: Math.max(8, Math.floor(12 * densityPenalty)),
    }
  }
  if (tier === 'high') {
    return {
      qualityTier: tier,
      textureUploadMaxUploads: 6,
      textureUploadMaxBytes: 16 * 1024 * 1024,
      animationMaxTicks: Math.max(12, Math.floor(22 * densityPenalty)),
      animationMaxThreeTicks: Math.max(2, Math.floor(3 * densityPenalty)),
      animationMaxLive2DTicks: Math.max(1, Math.floor(2 * densityPenalty)),
      animationMaxFrameMarks: Math.max(12, Math.floor(16 * densityPenalty)),
    }
  }
  return {
    qualityTier: tier,
    textureUploadMaxUploads: 8,
    textureUploadMaxBytes: 24 * 1024 * 1024,
    animationMaxTicks: Math.max(16, Math.floor(28 * densityPenalty)),
    animationMaxThreeTicks: Math.max(3, Math.floor(4 * densityPenalty)),
    animationMaxLive2DTicks: Math.max(2, Math.floor(3 * densityPenalty)),
    animationMaxFrameMarks: Math.max(16, Math.floor(20 * densityPenalty)),
  }
}

export class RenderBudgetGovernor {
  private samples: number[] = []
  private overBudgetFrames = 0
  private lastFrameMs = 0
  private current: RenderBudgetRecommendation = recommendationsFor('high', 0)

  constructor(private readonly targetFrameMs = DEFAULT_TARGET_FRAME_MS) {}

  beginFrame(_timeMs: number, cardCount: number): RenderBudgetRecommendation {
    this.current = { ...recommendationsFor(this.current.qualityTier, cardCount) }
    return this.current
  }

  recordFrame(metrics: RenderBudgetFrameMetrics): RenderBudgetStats {
    const frameMs = Number.isFinite(metrics.frameMs) ? Math.max(0, metrics.frameMs) : 0
    this.lastFrameMs = frameMs
    this.samples.push(frameMs)
    if (this.samples.length > SAMPLE_LIMIT) this.samples.shift()
    if (frameMs > this.targetFrameMs * 1.2 || metrics.droppedMs > 0) this.overBudgetFrames += 1

    const p95 = percentile(this.samples, 95)
    const pressure = Math.max(frameMs, p95)
    const cardCount = metrics.cardCount
    let tier: RenderQualityTier = 'ultra'
    if (pressure > this.targetFrameMs * 1.75 || metrics.droppedMs > 0) tier = 'recovery'
    else if (pressure > this.targetFrameMs * 1.35 || cardCount > 1000) tier = 'balanced'
    else if (pressure > this.targetFrameMs * 1.05 || cardCount > 500) tier = 'high'

    this.current = recommendationsFor(tier, cardCount)
    return this.getStats()
  }

  getStats(): RenderBudgetStats {
    return {
      ...this.current,
      targetFrameMs: this.targetFrameMs,
      lastFrameMs: this.lastFrameMs,
      frameP95Ms: percentile(this.samples, 95),
      overBudgetFrames: this.overBudgetFrames,
      sampleCount: this.samples.length,
    }
  }

  reset(): void {
    this.samples = []
    this.overBudgetFrames = 0
    this.lastFrameMs = 0
    this.current = recommendationsFor('high', 0)
  }
}

export const renderBudgetGovernor = new RenderBudgetGovernor()
