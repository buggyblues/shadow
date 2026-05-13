import { describe, expect, it, vi } from 'vitest'
import { createShadowMessageProcessingQueue } from '../src/monitor/message-queue.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('OpenClaw message processing queue', () => {
  it('serializes messages in the same channel/thread', async () => {
    const first = deferred()
    const started: string[] = []
    const completed: string[] = []
    const queue = createShadowMessageProcessingQueue({
      process: async (message: { id: string; channelId: string; threadId?: string }) => {
        started.push(message.id)
        if (message.id === 'one') await first.promise
        completed.push(message.id)
      },
    })

    const firstTask = queue.enqueue({ id: 'one', channelId: 'c1', threadId: 't1' }, 'ws')
    const secondTask = queue.enqueue({ id: 'two', channelId: 'c1', threadId: 't1' }, 'ws')

    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual(['one'])
    first.resolve()
    await Promise.all([firstTask, secondTask])

    expect(started).toEqual(['one', 'two'])
    expect(completed).toEqual(['one', 'two'])
  })

  it('keeps independent channel queues unblocked', async () => {
    const first = deferred()
    const started: string[] = []
    const queue = createShadowMessageProcessingQueue({
      process: async (message: { id: string; channelId: string }) => {
        started.push(message.id)
        if (message.id === 'one') await first.promise
      },
    })

    const firstTask = queue.enqueue({ id: 'one', channelId: 'c1' }, 'ws')
    const secondTask = queue.enqueue({ id: 'two', channelId: 'c2' }, 'ws')

    await secondTask
    expect(started).toEqual(['one', 'two'])
    first.resolve()
    await firstTask
  })

  it('does not advance queued work after stop', async () => {
    const skipped = vi.fn()
    const queue = createShadowMessageProcessingQueue({
      isStopped: () => true,
      onSkipped: skipped,
      process: vi.fn(),
    })

    await queue.enqueue({ id: 'one', channelId: 'c1' }, 'catchup')

    expect(skipped).toHaveBeenCalledWith({ id: 'one', channelId: 'c1' }, 'catchup')
  })
})
