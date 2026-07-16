export interface LatestIntentToggleOptions<Result> {
  execute: (enabled: boolean) => Promise<Result>
  onIntent: (enabled: boolean) => void
  onExecutionResult?: (result: Result, enabled: boolean) => void
  onResult: (result: Result, enabled: boolean) => void
  onError: (error: unknown, enabled: boolean) => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
}

export interface LatestIntentToggleController {
  request: (enabled: boolean) => Promise<void>
  isBusy: () => boolean
}

export function resolveLatestIntentToggleValue(
  actual: boolean,
  latestIntent: boolean | null,
): boolean {
  return latestIntent ?? actual
}

/**
 * Serializes an async boolean toggle while retaining the latest requested value.
 * Every execution result can update actual state, while only the final intent settles the UI.
 */
export function createLatestIntentToggle<Result>(
  options: LatestIntentToggleOptions<Result>,
): LatestIntentToggleController {
  let desired: boolean | undefined
  let active: Promise<void> | null = null

  const drain = async (): Promise<void> => {
    options.onBusyChange?.(true)
    try {
      while (desired !== undefined) {
        const target = desired
        try {
          const result = await options.execute(target)
          options.onExecutionResult?.(result, target)
          if (desired === target) {
            desired = undefined
            options.onResult(result, target)
          }
        } catch (error) {
          if (desired === target) {
            desired = undefined
            await options.onError(error, target)
          }
        }
      }
    } finally {
      options.onBusyChange?.(false)
    }
  }

  const startDrain = (): Promise<void> => {
    if (active) return active

    const run = drain()
    active = run
    void run.finally(() => {
      active = null
      if (desired !== undefined) void startDrain()
    })
    return run
  }

  return {
    request(enabled) {
      desired = enabled
      options.onIntent(enabled)
      return startDrain()
    },
    isBusy() {
      return active !== null
    },
  }
}
