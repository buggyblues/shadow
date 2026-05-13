export type ShadowMessageQueueSource = 'ws' | 'catchup'

export type ShadowMessageQueueItem = {
  id: string
  channelId: string
  threadId?: string | null
}

type ShadowMessageQueueOptions<TMessage extends ShadowMessageQueueItem> = {
  process: (message: TMessage, source: ShadowMessageQueueSource) => Promise<void> | void
  isStopped?: () => boolean
  onSkipped?: (message: TMessage, source: ShadowMessageQueueSource) => void
}

function queueKeyForMessage(message: ShadowMessageQueueItem) {
  return `${message.channelId}:${message.threadId ?? ''}`
}

export function createShadowMessageProcessingQueue<TMessage extends ShadowMessageQueueItem>(
  options: ShadowMessageQueueOptions<TMessage>,
) {
  const queues = new Map<string, Promise<void>>()

  return {
    enqueue(message: TMessage, source: ShadowMessageQueueSource): Promise<void> {
      const key = queueKeyForMessage(message)
      const previous = queues.get(key) ?? Promise.resolve()
      const task = previous
        .catch(() => undefined)
        .then(() => {
          if (options.isStopped?.()) {
            options.onSkipped?.(message, source)
            return
          }
          return options.process(message, source)
        })
        .finally(() => {
          if (queues.get(key) === task) queues.delete(key)
        })
      queues.set(key, task)
      return task
    },
    pendingKeys() {
      return [...queues.keys()]
    },
  }
}
