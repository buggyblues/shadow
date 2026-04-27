import type {
  CreateTypingCallbacksParams,
  TypingCallbacks,
} from 'openclaw/plugin-sdk/channel-reply-pipeline'

export function createTypingCallbacks(params: CreateTypingCallbacksParams): TypingCallbacks {
  const {
    start,
    stop,
    onStartError,
    onStopError,
    keepaliveIntervalMs = 2000,
    maxDurationMs = 120_000,
  } = params

  let keepaliveTimer: ReturnType<typeof setInterval> | null = null
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null

  const cleanup = () => {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer)
      keepaliveTimer = null
    }
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = null
    }
  }

  return {
    onReplyStart: async () => {
      try {
        await start()
      } catch (err) {
        onStartError(err)
        return
      }

      keepaliveTimer = setInterval(async () => {
        try {
          await start()
        } catch (err) {
          onStartError(err)
        }
      }, keepaliveIntervalMs)

      maxDurationTimer = setTimeout(() => {
        cleanup()
        stop?.().catch((err) => onStopError?.(err))
      }, maxDurationMs)
    },
    onIdle: () => {
      cleanup()
    },
    onCleanup: () => {
      cleanup()
      stop?.().catch((err) => onStopError?.(err))
    },
  }
}
