import { describe, expect, it, vi } from 'vitest'
import {
  createLatestIntentToggle,
  resolveLatestIntentToggleValue,
} from '../src/renderer/lib/latest-intent-toggle'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('latest-intent toggle', () => {
  it('serializes false -> true -> false and only applies the final result', async () => {
    const start = deferred<string>()
    const stop = deferred<string>()
    const execute = vi
      .fn<(enabled: boolean) => Promise<string>>()
      .mockImplementationOnce(() => start.promise)
      .mockImplementationOnce(() => stop.promise)
    const onResult = vi.fn()
    const onBusyChange = vi.fn()
    let actual = false
    let latestIntent: boolean | null = null
    const controller = createLatestIntentToggle({
      execute,
      onIntent: (enabled) => {
        latestIntent = enabled
      },
      onExecutionResult: (_result, enabled) => {
        actual = enabled
      },
      onResult: (result, enabled) => {
        latestIntent = null
        onResult(result, enabled)
      },
      onError: vi.fn(),
      onBusyChange,
    })

    const firstRequest = controller.request(true)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(true)
    const finalRequest = controller.request(false)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(false)

    expect(execute.mock.calls).toEqual([[true]])
    start.resolve('started')
    await vi.waitFor(() => expect(execute.mock.calls).toEqual([[true], [false]]))
    expect(actual).toBe(true)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(false)
    expect(onResult).not.toHaveBeenCalled()

    stop.resolve('stopped')
    await Promise.all([firstRequest, finalRequest])

    expect(onResult).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenCalledWith('stopped', false)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(false)
    expect(onBusyChange.mock.calls).toEqual([[true], [false]])
    expect(controller.isBusy()).toBe(false)
  })

  it('serializes true -> false -> true and only applies the final result', async () => {
    const stop = deferred<string>()
    const start = deferred<string>()
    let concurrent = 0
    let maxConcurrent = 0
    const execute = vi.fn(async (enabled: boolean) => {
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      try {
        return await (enabled ? start.promise : stop.promise)
      } finally {
        concurrent -= 1
      }
    })
    const onResult = vi.fn()
    const controller = createLatestIntentToggle({
      execute,
      onIntent: vi.fn(),
      onResult,
      onError: vi.fn(),
    })

    const firstRequest = controller.request(false)
    const finalRequest = controller.request(true)

    expect(execute.mock.calls).toEqual([[false]])
    stop.resolve('stopped')
    await vi.waitFor(() => expect(execute.mock.calls).toEqual([[false], [true]]))
    expect(onResult).not.toHaveBeenCalled()

    start.resolve('started')
    await Promise.all([firstRequest, finalRequest])

    expect(maxConcurrent).toBe(1)
    expect(onResult).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenCalledWith('started', true)
  })

  it('reports the final request failure and remains usable', async () => {
    const failure = new Error('connector failed to stop')
    const execute = vi
      .fn<(enabled: boolean) => Promise<string>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce('started')
    const onResult = vi.fn()
    const onError = vi.fn()
    const onBusyChange = vi.fn()
    let actual = true
    let latestIntent: boolean | null = null
    const controller = createLatestIntentToggle({
      execute,
      onIntent: (enabled) => {
        latestIntent = enabled
      },
      onExecutionResult: (_result, enabled) => {
        actual = enabled
      },
      onResult: (result, enabled) => {
        latestIntent = null
        onResult(result, enabled)
      },
      onError: (error, enabled) => {
        latestIntent = null
        onError(error, enabled)
      },
      onBusyChange,
    })

    const failedRequest = controller.request(false)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(false)
    await failedRequest

    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(failure, false)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(true)
    expect(controller.isBusy()).toBe(false)

    await controller.request(true)

    expect(onResult).toHaveBeenCalledWith('started', true)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(true)
    expect(onBusyChange.mock.calls).toEqual([[true], [false], [true], [false]])
  })

  it('rolls back to the latest successful execution when the final intent fails', async () => {
    const stop = deferred<string>()
    const start = deferred<string>()
    const execute = vi.fn((enabled: boolean) => (enabled ? start.promise : stop.promise))
    const onError = vi.fn()
    let actual = true
    let latestIntent: boolean | null = null
    const controller = createLatestIntentToggle({
      execute,
      onIntent: (enabled) => {
        latestIntent = enabled
      },
      onExecutionResult: (_result, enabled) => {
        actual = enabled
      },
      onResult: () => {
        latestIntent = null
      },
      onError: (error, enabled) => {
        latestIntent = null
        onError(error, enabled)
      },
    })

    const stopRequest = controller.request(false)
    const startRequest = controller.request(true)
    stop.resolve('stopped')
    await vi.waitFor(() => expect(execute.mock.calls).toEqual([[false], [true]]))

    expect(actual).toBe(false)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(true)

    const failure = new Error('connector failed to start')
    start.reject(failure)
    await Promise.all([stopRequest, startRequest])

    expect(onError).toHaveBeenCalledWith(failure, true)
    expect(resolveLatestIntentToggleValue(actual, latestIntent)).toBe(false)
  })
})
