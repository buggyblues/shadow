type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export function scheduleIdleAfterNextPaint(callback: () => void, timeoutMs = 1200) {
  if (typeof window === 'undefined') {
    callback()
    return () => {}
  }

  let cancelled = false
  let frameId: number | null = null
  let idleId: number | null = null
  let timeoutId: number | null = null

  frameId = window.requestAnimationFrame(() => {
    frameId = null
    if (cancelled) return

    const idleWindow = window as IdleWindow
    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(
        () => {
          idleId = null
          if (!cancelled) callback()
        },
        { timeout: timeoutMs },
      )
      return
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = null
      if (!cancelled) callback()
    }, 150)
  })

  return () => {
    cancelled = true
    if (frameId !== null) window.cancelAnimationFrame(frameId)
    if (idleId !== null) {
      const idleWindow = window as IdleWindow
      idleWindow.cancelIdleCallback?.(idleId)
    }
    if (timeoutId !== null) window.clearTimeout(timeoutId)
  }
}

export function scheduleIdleAfterDelay(callback: () => void, delayMs = 1200, timeoutMs = 1600) {
  if (typeof window === 'undefined') {
    callback()
    return () => {}
  }

  let cancelIdle: (() => void) | null = null
  const timeoutId = window.setTimeout(() => {
    cancelIdle = scheduleIdleAfterNextPaint(callback, timeoutMs)
  }, delayMs)

  return () => {
    window.clearTimeout(timeoutId)
    cancelIdle?.()
  }
}
