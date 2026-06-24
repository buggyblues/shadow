import { describe, expect, it } from 'vitest'
import { parseBuddyInboxTaskResultMetadata } from '../src/types/message.types'

describe('parseBuddyInboxTaskResultMetadata', () => {
  it('parses Buddy Inbox task result cards', () => {
    const result = parseBuddyInboxTaskResultMetadata({
      cards: [
        {
          id: 'result-card',
          kind: 'task_result',
          version: 1,
          title: 'Child task',
          body: 'All tests passed.',
          idempotencyKey: 'task-result:m1:c1:completed',
          taskMessageId: 'm1',
          taskCardId: 'c1',
          status: 'completed',
          delivery: 'parent_task_thread',
          sourceTask: {
            messageId: 'm1',
            cardId: 'c1',
            channelId: 'source-channel',
            threadId: 'source-thread',
            title: 'Child task',
          },
          parentTask: {
            messageId: 'm0',
            cardId: 'c0',
            channelId: 'parent-channel',
            threadId: 'parent-thread',
            title: 'Parent task',
          },
        },
      ],
    })

    expect(result).toMatchObject({
      id: 'result-card',
      kind: 'task_result',
      title: 'Child task',
      body: 'All tests passed.',
      status: 'completed',
      taskMessageId: 'm1',
      taskCardId: 'c1',
      sourceTask: { messageId: 'm1', title: 'Child task' },
      parentTask: { messageId: 'm0', title: 'Parent task' },
    })
  })

  it('keeps legacy custom task result metadata readable', () => {
    const result = parseBuddyInboxTaskResultMetadata({
      custom: {
        buddyInboxTaskResult: {
          kind: 'task_result',
          taskMessageId: 'm1',
          taskCardId: 'c1',
          status: 'completed',
          sourceTask: {
            messageId: 'm1',
            cardId: 'c1',
            channelId: 'source-channel',
            threadId: 'source-thread',
            title: 'Child task',
          },
        },
      },
    })

    expect(result).toMatchObject({
      id: 'task-result:m1:c1:completed',
      kind: 'task_result',
      title: 'Child task',
      version: 1,
      sourceTask: { messageId: 'm1', title: 'Child task' },
    })
  })

  it('ignores incomplete task result metadata', () => {
    expect(
      parseBuddyInboxTaskResultMetadata({
        cards: [
          {
            id: 'result-card',
            kind: 'task_result',
            version: 1,
            title: 'Child task',
            taskMessageId: 'm1',
            status: 'completed',
          },
        ],
      }),
    ).toBeNull()
  })

  it('omits malformed nested task references', () => {
    const result = parseBuddyInboxTaskResultMetadata({
      cards: [
        {
          id: 'result-card',
          kind: 'task_result',
          version: 1,
          title: 'Child task',
          taskMessageId: 'm1',
          taskCardId: 'c1',
          status: 'completed',
          sourceTask: {
            messageId: 'm1',
            cardId: 'c1',
            title: 123,
          },
        },
      ],
    })

    expect(result?.sourceTask).toBeUndefined()
  })
})
