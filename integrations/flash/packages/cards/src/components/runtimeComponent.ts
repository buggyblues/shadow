// ══════════════════════════════════════════════════════════════
// Component — Runtime Activation (SoA, bitECS)
//
// Tracks which dynamic card runtimes may prepare or tick this frame.
// Plugins read this ECS state instead of deciding independently.
// ══════════════════════════════════════════════════════════════

export const RUNTIME_NONE = 0
export const RUNTIME_GIF = 1
export const RUNTIME_LOTTIE = 2
export const RUNTIME_THREE = 3
export const RUNTIME_LIVE2D = 4

export const Runtime = {
  kind: [] as number[],
  active: [] as number[],
  autoplay: [] as number[],
  preload: [] as number[],
  prewarm: [] as number[],
  prepare: [] as number[],
  priority: [] as number[],
}

export const CRuntime = Runtime

export function runtimeKindCode(kind: string): number {
  switch (kind) {
    case 'gif':
      return RUNTIME_GIF
    case 'lottie':
      return RUNTIME_LOTTIE
    case 'threed':
      return RUNTIME_THREE
    case 'live2d':
      return RUNTIME_LIVE2D
    default:
      return RUNTIME_NONE
  }
}

export function isDynamicRuntimeKind(kind: string): boolean {
  return runtimeKindCode(kind) !== RUNTIME_NONE
}
