import {
  type DiyCloudDraft,
  type DiyCloudGenerateInput,
  type DiyCloudProgressEvent,
  generateDiyCloudDraft,
} from './diy-cloud.service'
import { appendDiyCloudSessionEvent, failDiyCloudSession } from './diy-cloud-session.service'

export type DiyCloudAgentSessionRunInput = {
  userId: string
  sessionId: string
  input: DiyCloudGenerateInput
  onEvent?: (event: DiyCloudProgressEvent) => void | Promise<void>
}

export function createDiyCloudAcceptedEvent(input: DiyCloudGenerateInput): DiyCloudProgressEvent {
  return {
    type: 'progress',
    id: `accepted-${Date.now().toString(36)}`,
    step: 'think',
    status: 'running',
    title: input.locale?.toLowerCase().startsWith('zh')
      ? '生成请求已接收'
      : 'Generation request accepted',
    detail: input.locale?.toLowerCase().startsWith('zh')
      ? '正在启动配置生成 Agent。'
      : 'Starting the config generation agent.',
    timestamp: new Date().toISOString(),
  }
}

export async function runDiyCloudAgentSession({
  userId,
  sessionId,
  input,
  onEvent,
}: DiyCloudAgentSessionRunInput): Promise<DiyCloudDraft> {
  try {
    return await generateDiyCloudDraft(input, {
      onProgress: async (event) => {
        await appendDiyCloudSessionEvent(userId, sessionId, event)
        await onEvent?.(event)
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate DIY Cloud draft'
    await failDiyCloudSession(userId, sessionId, message)
    throw err
  }
}
