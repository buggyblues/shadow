import type { CodexPetSpriteVersion } from '../../shared/pet-spritesheet-contract'
import type { CodexPetAnimationKey } from '../pet-types'

export type CodexPetFrame = {
  columnIndex: number
  rowIndex: number
  frameDurationMs: number
}

export type CodexPetPlayback = {
  frames: CodexPetFrame[]
  loopStartIndex: number | null
}

const SLOW_IDLE_MULTIPLIER = 6
const ACTIVE_STATE_REPETITIONS = 3

const IDLE_FRAMES: CodexPetFrame[] = [
  { rowIndex: 0, columnIndex: 0, frameDurationMs: 280 },
  { rowIndex: 0, columnIndex: 1, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 2, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 3, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 4, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 5, frameDurationMs: 320 },
]

const SLOW_IDLE_FRAMES = IDLE_FRAMES.map((frame) => ({
  ...frame,
  frameDurationMs: frame.frameDurationMs * SLOW_IDLE_MULTIPLIER,
}))

function stateFrames(
  rowIndex: number,
  count: number,
  frameDurationMs: number,
  lastFrameDurationMs: number,
): CodexPetFrame[] {
  return Array.from({ length: count }, (_, columnIndex) => ({
    rowIndex,
    columnIndex,
    frameDurationMs: columnIndex === count - 1 ? lastFrameDurationMs : frameDurationMs,
  }))
}

const STATE_FRAMES: Record<CodexPetAnimationKey, CodexPetFrame[]> = {
  failed: stateFrames(5, 8, 140, 240),
  idle: IDLE_FRAMES,
  jumping: stateFrames(4, 5, 140, 280),
  review: stateFrames(8, 6, 150, 280),
  running: stateFrames(7, 6, 120, 220),
  'running-left': stateFrames(2, 8, 120, 220),
  'running-right': stateFrames(1, 8, 120, 220),
  waving: stateFrames(3, 4, 140, 280),
  waiting: stateFrames(6, 6, 150, 260),
}

export function codexPetPlayback(
  state: CodexPetAnimationKey,
  prefersReducedMotion = false,
): CodexPetPlayback {
  const stateSequence = STATE_FRAMES[state]
  if (prefersReducedMotion) {
    return { frames: [stateSequence[0]!], loopStartIndex: null }
  }
  if (state === 'idle') {
    return { frames: SLOW_IDLE_FRAMES, loopStartIndex: 0 }
  }
  const activeFrames = Array.from({ length: ACTIVE_STATE_REPETITIONS }, () => stateSequence).flat()
  return {
    frames: [...activeFrames, ...SLOW_IDLE_FRAMES],
    loopStartIndex: activeFrames.length,
  }
}

export function codexPetActivePlaybackDuration(state: CodexPetAnimationKey): number {
  const playback = codexPetPlayback(state)
  const activeFrames =
    playback.loopStartIndex === null
      ? playback.frames
      : playback.frames.slice(0, playback.loopStartIndex)
  return activeFrames.reduce((total, frame) => total + frame.frameDurationMs, 0)
}

export function codexPetLookFrame(input: {
  spriteVersionNumber: CodexPetSpriteVersion
  petCenter: { x: number; y: number }
  pointer: { x: number; y: number }
  deadzoneRadius?: number
}): CodexPetFrame | null {
  if (input.spriteVersionNumber < 2) return null
  const deltaX = input.pointer.x - input.petCenter.x
  const deltaY = input.pointer.y - input.petCenter.y
  const deadzoneRadius = Math.max(0, input.deadzoneRadius ?? 24)
  if (Math.hypot(deltaX, deltaY) <= deadzoneRadius) return null

  const clockwiseFromUp = (Math.atan2(deltaX, -deltaY) * 180) / Math.PI
  const normalizedAngle = (clockwiseFromUp + 360) % 360
  const directionIndex = Math.round(normalizedAngle / 22.5) % 16
  return {
    rowIndex: directionIndex < 8 ? 9 : 10,
    columnIndex: directionIndex % 8,
    frameDurationMs: 0,
  }
}

export function codexPetBackgroundPosition(
  frame: Pick<CodexPetFrame, 'columnIndex' | 'rowIndex'>,
  columns: number,
  rows: number,
): string {
  const safeColumns = Math.max(1, columns)
  const safeRows = Math.max(1, rows)
  const x = safeColumns === 1 ? 0 : (frame.columnIndex / (safeColumns - 1)) * 100
  const y = safeRows === 1 ? 0 : (frame.rowIndex / (safeRows - 1)) * 100
  return `${x}% ${y}%`
}
