import type { StreamFn } from '@earendil-works/pi-agent-core'
import {
  type AssistantMessage,
  type Context,
  createAssistantMessageEventStream,
  type Message,
  type Model,
  type StopReason,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
  type Usage,
} from '@earendil-works/pi-ai'
import { SafeHttpClient } from '../../gateways/safe-http-client'
import { logger } from '../../lib/logger'
import { DEFAULT_GENERATOR_MODEL } from './config'
import { firstNonEmptyEnv } from './utils'

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

type OpenAiToolCall = {
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  reasoning_content?: string | null
  tool_call_id?: string
  tool_calls?: OpenAiToolCall[]
}

type OpenAiChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export function generatorBaseUrl() {
  return firstNonEmptyEnv(
    'SHADOW_DIY_CLOUD_GENERATOR_BASE_URL',
    'SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL',
  )?.replace(/\/+$/, '')
}

export function generatorApiKey() {
  return firstNonEmptyEnv(
    'SHADOW_DIY_CLOUD_GENERATOR_API_KEY',
    'SHADOW_MODEL_PROXY_UPSTREAM_API_KEY',
  )
}

export function generatorModel() {
  return (
    firstNonEmptyEnv(
      'SHADOW_DIY_CLOUD_GENERATOR_MODEL',
      'SHADOW_MODEL_PROXY_MODEL',
      'SHADOW_MODEL_PROXY_DEFAULT_MODEL',
    ) ?? DEFAULT_GENERATOR_MODEL
  )
}

export function createDiyCloudPiModel(): Model<any> {
  const id = generatorModel()
  return {
    id,
    name: id,
    api: 'openai-completions',
    provider: 'shadow-diy-cloud',
    baseUrl: generatorBaseUrl() ?? '',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  } satisfies Model<any>
}

function chatCompletionsUrl(baseUrl: string) {
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`
}

function cloneUsage(usage: Usage = EMPTY_USAGE): Usage {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: { ...usage.cost },
  }
}

function usageFromOpenAi(value: OpenAiChunk['usage']): Usage {
  const input = value?.prompt_tokens ?? 0
  const output = value?.completion_tokens ?? 0
  const totalTokens = value?.total_tokens ?? input + output
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function baseAssistantMessage(model: Model<any>, usage: Usage = EMPTY_USAGE): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: cloneUsage(usage),
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

function textFromContent(content: Message['content']) {
  if (typeof content === 'string') return content
  return content
    .map((item) => {
      if (item.type === 'text') return item.text
      if (item.type === 'image') return `[image:${item.mimeType}]`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function assistantTextAndToolCalls(message: AssistantMessage) {
  const text = message.content
    .map((item) => (item.type === 'text' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
  const reasoningContent = message.content
    .map((item) => (item.type === 'thinking' ? item.thinking : ''))
    .filter(Boolean)
    .join('\n')
  const toolCalls = message.content
    .filter((item): item is ToolCall => item.type === 'toolCall')
    .map((item) => ({
      id: item.id,
      type: 'function',
      function: {
        name: item.name,
        arguments: JSON.stringify(item.arguments ?? {}),
      },
    }))
  return { text, reasoningContent, toolCalls }
}

function convertMessages(messages: Message[]): OpenAiMessage[] {
  return messages.map((message) => {
    if (message.role === 'user') {
      return { role: 'user', content: textFromContent(message.content) }
    }
    if (message.role === 'toolResult') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: textFromContent(message.content),
      }
    }
    const assistant = assistantTextAndToolCalls(message)
    return {
      role: 'assistant',
      content: assistant.text || '',
      ...(assistant.reasoningContent ? { reasoning_content: assistant.reasoningContent } : {}),
      ...(assistant.toolCalls.length > 0 ? { tool_calls: assistant.toolCalls } : {}),
    }
  })
}

function convertTools(context: Context) {
  return (context.tools ?? []).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function shouldRequestJsonObject(context: Context, toolCount: number) {
  if (toolCount > 0) return false
  const lastMessage = context.messages[context.messages.length - 1]
  return (
    lastMessage?.role === 'user' &&
    textFromContent(lastMessage.content).includes('DIY_CLOUD_FINAL_JSON_ONLY')
  )
}

function stopReasonFromFinishReason(reason: string | null | undefined): StopReason {
  if (reason === 'tool_calls' || reason === 'function_call') return 'toolUse'
  if (reason === 'length') return 'length'
  return 'stop'
}

function doneReason(reason: StopReason): 'stop' | 'length' | 'toolUse' {
  if (reason === 'length' || reason === 'toolUse') return reason
  return 'stop'
}

function parseToolArguments(raw: string) {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function errorMessage(model: Model<any>, error: unknown, aborted = false): AssistantMessage {
  return {
    ...baseAssistantMessage(model),
    stopReason: aborted ? 'aborted' : 'error',
    errorMessage: error instanceof Error ? error.message : String(error),
  }
}

async function readProviderError(response: Response) {
  const text = await response.text().catch(() => '')
  return text.replace(/\s+/g, ' ').trim().slice(0, 1200)
}

function asTextContent(text: string): TextContent {
  return { type: 'text', text }
}

function asThinkingContent(thinking: string): ThinkingContent {
  return { type: 'thinking', thinking }
}

function appendNonStreamingMessage(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  model: Model<any>,
  message: { content?: string | null; tool_calls?: OpenAiToolCall[] },
  finishReason?: string | null,
  usage?: Usage,
) {
  const assistant = baseAssistantMessage(model, usage)
  stream.push({ type: 'start', partial: { ...assistant } })

  const content = typeof message.content === 'string' ? message.content : ''
  const reasoningContent =
    typeof (message as { reasoning_content?: unknown }).reasoning_content === 'string'
      ? (message as { reasoning_content: string }).reasoning_content
      : ''
  if (reasoningContent) {
    const contentIndex = assistant.content.length
    assistant.content.push(asThinkingContent(''))
    stream.push({ type: 'thinking_start', contentIndex, partial: { ...assistant } })
    assistant.content[contentIndex] = asThinkingContent(reasoningContent)
    stream.push({
      type: 'thinking_delta',
      contentIndex,
      delta: reasoningContent,
      partial: { ...assistant },
    })
    stream.push({
      type: 'thinking_end',
      contentIndex,
      content: reasoningContent,
      partial: { ...assistant },
    })
  }
  if (content) {
    const contentIndex = assistant.content.length
    assistant.content.push(asTextContent(''))
    stream.push({ type: 'text_start', contentIndex, partial: { ...assistant } })
    assistant.content[contentIndex] = asTextContent(content)
    stream.push({
      type: 'text_delta',
      contentIndex,
      delta: content,
      partial: { ...assistant },
    })
    stream.push({
      type: 'text_end',
      contentIndex,
      content,
      partial: { ...assistant },
    })
  }

  for (const call of message.tool_calls ?? []) {
    const contentIndex = assistant.content.length
    const toolCall: ToolCall = {
      type: 'toolCall',
      id: call.id ?? `tool-${contentIndex}`,
      name: call.function?.name ?? '',
      arguments: parseToolArguments(call.function?.arguments ?? ''),
    }
    assistant.content.push(toolCall)
    stream.push({ type: 'toolcall_start', contentIndex, partial: { ...assistant } })
    stream.push({
      type: 'toolcall_delta',
      contentIndex,
      delta: call.function?.arguments ?? '',
      partial: { ...assistant },
    })
    stream.push({
      type: 'toolcall_end',
      contentIndex,
      toolCall,
      partial: { ...assistant },
    })
  }

  assistant.stopReason =
    message.tool_calls && message.tool_calls.length > 0
      ? 'toolUse'
      : stopReasonFromFinishReason(finishReason)
  stream.push({
    type: 'done',
    reason: doneReason(assistant.stopReason),
    message: assistant,
  })
}

async function readJsonResponse(
  response: Response,
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  model: Model<any>,
) {
  const data = (await response.json().catch(() => null)) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: OpenAiToolCall[] }
      finish_reason?: string | null
    }>
    usage?: OpenAiChunk['usage']
  } | null
  const choice = data?.choices?.[0]
  appendNonStreamingMessage(
    stream,
    model,
    choice?.message ?? {},
    choice?.finish_reason,
    usageFromOpenAi(data?.usage),
  )
}

function splitSseBlock(block: string) {
  const lines = block.split(/\r?\n/)
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  return data
}

async function readStreamingResponse(
  response: Response,
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  model: Model<any>,
) {
  if (!response.body) {
    throw new Error('DIY Cloud model response did not include a stream body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finishReason: string | null | undefined
  let usage = cloneUsage()
  const assistant = baseAssistantMessage(model)
  let textIndex: number | null = null
  let thinkingIndex: number | null = null
  let text = ''
  let thinking = ''
  const toolBuffers = new Map<
    number,
    {
      contentIndex: number
      id: string
      name: string
      args: string
    }
  >()

  stream.push({ type: 'start', partial: { ...assistant } })

  const processChunk = (chunk: OpenAiChunk) => {
    if (chunk.usage) usage = usageFromOpenAi(chunk.usage)
    const choice = chunk.choices?.[0]
    if (!choice) return
    finishReason = choice.finish_reason ?? finishReason
    const delta = choice.delta
    if (!delta) return

    if (delta.reasoning_content) {
      if (thinkingIndex === null) {
        thinkingIndex = assistant.content.length
        assistant.content.push(asThinkingContent(''))
        stream.push({
          type: 'thinking_start',
          contentIndex: thinkingIndex,
          partial: { ...assistant },
        })
      }
      thinking += delta.reasoning_content
      assistant.content[thinkingIndex] = asThinkingContent(thinking)
      stream.push({
        type: 'thinking_delta',
        contentIndex: thinkingIndex,
        delta: delta.reasoning_content,
        partial: { ...assistant },
      })
    }

    if (delta.content) {
      if (textIndex === null) {
        textIndex = assistant.content.length
        assistant.content.push(asTextContent(''))
        stream.push({ type: 'text_start', contentIndex: textIndex, partial: { ...assistant } })
      }
      text += delta.content
      assistant.content[textIndex] = asTextContent(text)
      stream.push({
        type: 'text_delta',
        contentIndex: textIndex,
        delta: delta.content,
        partial: { ...assistant },
      })
    }

    for (const partialCall of delta.tool_calls ?? []) {
      const index = partialCall.index ?? 0
      let buffer = toolBuffers.get(index)
      if (!buffer) {
        buffer = {
          contentIndex: assistant.content.length,
          id: partialCall.id ?? `tool-${index}`,
          name: partialCall.function?.name ?? '',
          args: '',
        }
        assistant.content.push({
          type: 'toolCall',
          id: buffer.id,
          name: buffer.name,
          arguments: {},
        })
        toolBuffers.set(index, buffer)
        stream.push({
          type: 'toolcall_start',
          contentIndex: buffer.contentIndex,
          partial: { ...assistant },
        })
      }
      if (partialCall.id) buffer.id = partialCall.id
      if (partialCall.function?.name) buffer.name = partialCall.function.name
      if (partialCall.function?.arguments) {
        buffer.args += partialCall.function.arguments
        stream.push({
          type: 'toolcall_delta',
          contentIndex: buffer.contentIndex,
          delta: partialCall.function.arguments,
          partial: { ...assistant },
        })
      }
    }
  }

  const processBlock = (block: string) => {
    const data = splitSseBlock(block)
    if (!data || data === '[DONE]') return
    const parsed = JSON.parse(data) as OpenAiChunk
    processChunk(parsed)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary).trim()
      buffer = buffer.slice(boundary + 2)
      if (block) processBlock(block)
      boundary = buffer.indexOf('\n\n')
    }
  }
  const tail = buffer.trim()
  if (tail) processBlock(tail)

  if (textIndex !== null) {
    stream.push({
      type: 'text_end',
      contentIndex: textIndex,
      content: text,
      partial: { ...assistant },
    })
  }

  if (thinkingIndex !== null) {
    stream.push({
      type: 'thinking_end',
      contentIndex: thinkingIndex,
      content: thinking,
      partial: { ...assistant },
    })
  }

  for (const buffer of [...toolBuffers.values()].sort((a, b) => a.contentIndex - b.contentIndex)) {
    const toolCall: ToolCall = {
      type: 'toolCall',
      id: buffer.id,
      name: buffer.name,
      arguments: parseToolArguments(buffer.args),
    }
    assistant.content[buffer.contentIndex] = toolCall
    stream.push({
      type: 'toolcall_end',
      contentIndex: buffer.contentIndex,
      toolCall,
      partial: { ...assistant },
    })
  }

  assistant.usage = usage
  assistant.stopReason = toolBuffers.size > 0 ? 'toolUse' : stopReasonFromFinishReason(finishReason)
  stream.push({
    type: 'done',
    reason: doneReason(assistant.stopReason),
    message: assistant,
  })
}

export function createDiyCloudOpenAiStream(safeHttpClient: SafeHttpClient): StreamFn {
  return (model, context, options) => {
    const stream = createAssistantMessageEventStream()
    void (async () => {
      const baseUrl = model.baseUrl || generatorBaseUrl()
      const apiKey = options?.apiKey || generatorApiKey()
      if (!baseUrl || !apiKey) {
        stream.push({
          type: 'error',
          reason: 'error',
          error: errorMessage(model, 'DIY Cloud model provider is not configured'),
        })
        return
      }

      try {
        const tools = convertTools(context)
        const jsonOnly = shouldRequestJsonObject(context, tools.length)
        const payload = {
          model: model.id,
          temperature: 0.18,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            ...(context.systemPrompt
              ? [{ role: 'system' as const, content: context.systemPrompt }]
              : []),
            ...convertMessages(context.messages),
          ],
          ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
          ...(jsonOnly ? { response_format: { type: 'json_object' } } : {}),
        }
        const requestUrl = chatCompletionsUrl(baseUrl)
        const requestInit = (body: unknown): RequestInit => ({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: options?.signal,
          body: JSON.stringify(body),
        })
        let response = await safeHttpClient.fetch(requestUrl, requestInit(payload), {
          maxRedirects: 0,
        })
        if (!response.ok && jsonOnly && (response.status === 400 || response.status === 422)) {
          const fallbackPayload = { ...payload }
          delete (fallbackPayload as { response_format?: unknown }).response_format
          response = await safeHttpClient.fetch(requestUrl, requestInit(fallbackPayload), {
            maxRedirects: 0,
          })
        }
        if (!response.ok) {
          const providerError = await readProviderError(response)
          logger.warn(
            {
              status: response.status,
              providerError,
            },
            'DIY Cloud model provider rejected request',
          )
          throw Object.assign(
            new Error(`DIY Cloud model request failed with HTTP ${response.status}`),
            {
              status: 502,
              code: 'DIY_CLOUD_MODEL_REQUEST_FAILED',
            },
          )
        }
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          await readJsonResponse(response, stream, model)
        } else {
          await readStreamingResponse(response, stream, model)
        }
      } catch (err) {
        const aborted =
          err instanceof DOMException && err.name === 'AbortError'
            ? true
            : options?.signal?.aborted === true
        stream.push({
          type: 'error',
          reason: aborted ? 'aborted' : 'error',
          error: errorMessage(model, err, aborted),
        })
      }
    })()
    return stream
  }
}

export const diyCloudOpenAiStream: StreamFn = createDiyCloudOpenAiStream(
  new SafeHttpClient({ logger }),
)
