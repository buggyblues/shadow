import { ShadowClient } from '@shadowob/sdk'
import type { ChannelMessageActionContext } from 'openclaw/plugin-sdk'
import { DEFAULT_ACCOUNT_ID, getAccountConfig, listAccountIds } from '../config.js'
import {
  firstString,
  readMessageTarget,
  resolveShadowInteractiveBlock,
  validateApprovalMessageContent,
} from './interactive.js'
import { sendShadowMessage } from './send.js'
import { buildShadowMessageToolSchemaProperties } from './typebox-schema.js'

const SHADOW_DISCOVERED_ACTIONS = [
  'send',
  'upload-file',
  'send-voice',
  'react',
  'edit',
  'delete',
] as const

const SHADOW_HANDLED_ACTIONS = [...SHADOW_DISCOVERED_ACTIONS, 'get-connection-status'] as const

type ShadowActionResult = {
  content: Array<{ type: 'text'; text: string }>
  details: Record<string, unknown>
}

type DescribeMessageTool = NonNullable<
  NonNullable<import('openclaw/plugin-sdk').ChannelPlugin['actions']>['describeMessageTool']
>
type DescribeMessageToolContext = Parameters<DescribeMessageTool>[0]
type DescribeMessageToolResult = ReturnType<DescribeMessageTool>
type ShadowAttachmentKind = 'file' | 'image' | 'voice'
type ShadowUploadOptions = {
  messageId: string
  kind?: ShadowAttachmentKind
  durationMs?: number
  waveformPeaks?: number[]
  transcriptText?: string
  transcriptLanguage?: string
  transcriptSource?: 'runtime'
}

function textResult(value: Record<string, unknown>): ShadowActionResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value),
      },
    ],
    details: value,
  }
}

function readAttachmentSource(params: Record<string, unknown>) {
  return (
    firstString(
      params.media,
      params.mediaUrl,
      params.mediaURL,
      params.url,
      params.path,
      params.filePath,
      params.file,
      params.fileUrl,
      params.fileURL,
    ) ?? ''
  )
}

function hasAttachmentPayload(params: Record<string, unknown>) {
  return Boolean(firstString(params.buffer) || readAttachmentSource(params))
}

function readAttachmentContentType(params: Record<string, unknown>) {
  return firstString(params.contentType, params.mimeType) ?? 'application/octet-stream'
}

function readAttachmentFilename(params: Record<string, unknown>) {
  return firstString(params.filename, params.title) ?? 'file'
}

function readCommerceOfferId(params: Record<string, unknown>) {
  return firstString(params.commerceOfferId, params.offerId)
}

function readNumber(params: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function readWaveformPeaks(params: Record<string, unknown>) {
  const value = params.waveformPeaks ?? params.waveform_peaks
  if (Array.isArray(value)) {
    const peaks = value.map((item) => Number(item))
    return peaks.every((item) => Number.isInteger(item) && item >= 0 && item <= 100)
      ? peaks
      : undefined
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed)) return undefined
      const peaks = parsed.map((item) => Number(item))
      return peaks.every((item) => Number.isInteger(item) && item >= 0 && item <= 100)
        ? peaks
        : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function readAttachmentKind(params: Record<string, unknown>): ShadowAttachmentKind | undefined {
  const kind = firstString(params.attachmentKind, params.kind)
  return kind === 'voice' || kind === 'image' || kind === 'file' ? kind : undefined
}

function buildSendMetadata(params: {
  interactiveBlock?: Record<string, unknown>
  commerceOfferId?: string
}) {
  const metadata: Record<string, unknown> = {}
  if (params.interactiveBlock) metadata.interactive = params.interactiveBlock
  if (params.commerceOfferId) {
    metadata.commerceCards = [{ kind: 'offer', offerId: params.commerceOfferId }]
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

async function uploadShadowAttachment(params: {
  client: ShadowClient
  to: string
  messageId: string
  actionParams: Record<string, unknown>
}) {
  const contentType = readAttachmentContentType(params.actionParams)
  const filename = readAttachmentFilename(params.actionParams)
  const uploadTarget = params.messageId
  const base64Buffer = firstString(params.actionParams.buffer)
  const mediaUrl = readAttachmentSource(params.actionParams)
  const kind = readAttachmentKind(params.actionParams)
  const durationMs = readNumber(params.actionParams, 'durationMs', 'duration_ms')
  const waveformPeaks = readWaveformPeaks(params.actionParams)
  const transcriptText = firstString(
    params.actionParams.transcript,
    params.actionParams.transcriptText,
  )
  const transcriptLanguage = firstString(
    params.actionParams.transcriptLanguage,
    params.actionParams.transcript_language,
  )
  const uploadOptions: ShadowUploadOptions = { messageId: uploadTarget }
  if (kind) uploadOptions.kind = kind
  if (typeof durationMs === 'number') uploadOptions.durationMs = durationMs
  if (waveformPeaks) uploadOptions.waveformPeaks = waveformPeaks
  if (transcriptText) {
    uploadOptions.transcriptText = transcriptText
    uploadOptions.transcriptSource = 'runtime'
  }
  if (transcriptLanguage) uploadOptions.transcriptLanguage = transcriptLanguage

  if (base64Buffer) {
    const raw = base64Buffer.includes(',') ? (base64Buffer.split(',')[1] ?? '') : base64Buffer
    if (!raw) throw new Error('Invalid base64 attachment payload')
    const bytes = Buffer.from(raw, 'base64')
    const blob = new Blob([Uint8Array.from(bytes)], { type: contentType })
    await params.client.uploadMedia(blob, filename, contentType, uploadOptions)
    return { filename, contentType, source: 'buffer' as const }
  }

  if (mediaUrl) {
    await params.client.uploadMediaFromUrl(mediaUrl, uploadOptions)
    return { filename, contentType, source: 'media' as const, mediaUrl }
  }

  throw new Error('No buffer or media URL provided for attachment')
}

export const shadowMessageActions = {
  describeMessageTool: ({
    cfg,
    accountId,
  }: DescribeMessageToolContext): DescribeMessageToolResult => {
    const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
    return {
      actions: [...SHADOW_DISCOVERED_ACTIONS],
      capabilities: ['interactive'],
      schema: {
        visibility: 'current-channel',
        properties: buildShadowMessageToolSchemaProperties({
          commerceOffers: account?.commerceOffers,
        }),
      },
      mediaSourceParams: {
        'upload-file': [
          'media',
          'mediaUrl',
          'url',
          'path',
          'filePath',
          'file',
          'fileUrl',
          'buffer',
        ],
        'send-voice': ['media', 'mediaUrl', 'url', 'path', 'filePath', 'file', 'fileUrl', 'buffer'],
      },
    } as unknown as DescribeMessageToolResult
  },

  messageActionTargetAliases: {
    'upload-file': { aliases: ['recipient', 'to', 'channelId'] },
    'send-voice': { aliases: ['recipient', 'to', 'channelId'] },
  } as Record<string, { aliases: string[] }>,

  supportsAction: ({ action }: { action: string }): boolean =>
    (SHADOW_HANDLED_ACTIONS as readonly string[]).includes(action),

  handleAction: async (ctx: ChannelMessageActionContext) => {
    const account = getAccountConfig(ctx.cfg, ctx.accountId ?? DEFAULT_ACCOUNT_ID)
    if (!account) {
      return textResult({ ok: false, error: 'Shadow account not configured' })
    }

    const requestedAction = String(ctx.action)
    const action = requestedAction
    const { params } = ctx

    if (action === 'send') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        if (!to) return textResult({ ok: false, error: 'target is required' })

        const interactiveBlock = resolveShadowInteractiveBlock(params)
        const commerceOfferId = readCommerceOfferId(params)
        const hasAttachment = hasAttachmentPayload(params)
        const content =
          firstString(params.message, params.content, params.text, params.caption, params.prompt) ??
          (interactiveBlock ? '[interactive]' : '')
        if (!content.trim() && !interactiveBlock && !hasAttachment && !commerceOfferId) {
          return textResult({
            ok: false,
            error: 'message, attachment, or commerceOfferId is required',
          })
        }
        const approvalError = validateApprovalMessageContent(content, interactiveBlock)
        if (approvalError) return textResult({ ok: false, error: approvalError })

        const message = await sendShadowMessage({
          client,
          to,
          content: content.trim() ? content : interactiveBlock ? '[interactive]' : '\u200B',
          threadId: params.threadId as string | undefined,
          replyToId:
            (params.replyTo as string | undefined) ?? (params.replyToId as string | undefined),
          metadata: buildSendMetadata({ interactiveBlock, commerceOfferId }),
        })
        const attachment = hasAttachment
          ? await uploadShadowAttachment({
              client,
              to,
              messageId: message.id,
              actionParams: params,
            })
          : undefined

        return textResult({
          ok: true,
          action: 'send',
          messageId: message.id,
          interactive: !!interactiveBlock,
          kind: interactiveBlock?.kind,
          commerceCard: !!commerceOfferId,
          offerId: commerceOfferId,
          attachment: !!attachment,
          filename: attachment?.filename,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    if (action === 'upload-file' || action === 'send-voice') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        if (!to) return textResult({ ok: false, error: 'target is required' })
        if (!hasAttachmentPayload(params)) {
          return textResult({
            ok: false,
            error: 'upload-file requires buffer or an attachment source',
          })
        }
        const attachmentParams =
          action === 'send-voice' ? { ...params, kind: 'voice', attachmentKind: 'voice' } : params
        if (action === 'send-voice') {
          if (readNumber(attachmentParams, 'durationMs', 'duration_ms') === undefined) {
            return textResult({ ok: false, error: 'send-voice requires durationMs' })
          }
        }
        const text =
          firstString(
            attachmentParams.message,
            attachmentParams.content,
            attachmentParams.text,
            attachmentParams.caption,
          ) ?? ''
        const message = await sendShadowMessage({
          client,
          to,
          content: text || '\u200B',
          threadId: attachmentParams.threadId as string | undefined,
          replyToId:
            (attachmentParams.replyTo as string | undefined) ??
            (attachmentParams.replyToId as string | undefined),
        })
        const attachment = await uploadShadowAttachment({
          client,
          to,
          messageId: message.id,
          actionParams: attachmentParams,
        })

        return textResult({
          ok: true,
          action: requestedAction,
          canonicalAction: action,
          messageId: message.id,
          filename: attachment.filename,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    if (action === 'react') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      const emoji = (params.emoji as string) ?? (params.reaction as string) ?? ''
      if (!messageId || !emoji) {
        return textResult({ ok: false, error: 'messageId and emoji are required' })
      }
      try {
        await client.addReaction(messageId, emoji)
        return textResult({ ok: true, action: 'react', messageId, emoji })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    if (action === 'edit') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      const content = (params.message as string) ?? (params.content as string) ?? ''
      if (!messageId || !content) {
        return textResult({ ok: false, error: 'messageId and content are required' })
      }
      try {
        await client.editMessage(messageId, content)
        return textResult({ ok: true, action: 'edit', messageId })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    if (action === 'delete') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      if (!messageId) {
        return textResult({ ok: false, error: 'messageId is required' })
      }
      try {
        await client.deleteMessage(messageId)
        return textResult({ ok: true, action: 'delete', messageId })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    if (action === 'pin' || action === 'unpin') {
      return textResult({ ok: false, error: `${action} is not yet supported for Shadow channels` })
    }

    if (action === 'get-connection-status') {
      const accountIds = listAccountIds(ctx.cfg)
      const results = await Promise.all(
        accountIds.map(async (id) => {
          const acc = getAccountConfig(ctx.cfg, id)
          if (!acc) return { accountId: id, configured: false, ok: false, error: 'not configured' }
          if (!acc.token?.trim())
            return { accountId: id, configured: false, ok: false, error: 'no token' }
          try {
            const client = new ShadowClient(acc.serverUrl, acc.token)
            const me = await client.getMe()
            return {
              accountId: id,
              configured: true,
              enabled: acc.enabled !== false,
              ok: true,
              serverUrl: acc.serverUrl,
              user: me,
            }
          } catch (err) {
            return {
              accountId: id,
              configured: true,
              enabled: acc.enabled !== false,
              ok: false,
              serverUrl: acc.serverUrl,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }),
      )
      return textResult({ ok: true, action: 'get-connection-status', accounts: results })
    }

    return textResult({ ok: false, error: `Action ${action} not yet implemented` })
  },
}
