/**
 * Mock: openclaw/plugin-sdk/runtime-store
 *
 * Provides a test-compatible implementation of the OpenClaw SDK runtime store.
 * At runtime, this is provided by the OpenClaw host.
 */

export function createPluginRuntimeStore<T = any>(errorMessage: string) {
  let runtime: T | null = null
  return {
    setRuntime: (r: T) => {
      runtime = r
    },
    getRuntime: (): T => {
      if (!runtime) throw new Error(errorMessage)
      return runtime
    },
    tryGetRuntime: (): T | null => runtime,
  }
}
