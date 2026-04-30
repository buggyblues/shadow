import { ShadowClient } from '@shadowob/sdk'
import type { ChannelMessageActionContext } from 'openclaw/plugin-sdk'
import { DEFAULT_ACCOUNT_ID, getAccountConfig, listAccountIds } from '../config.js'
import { parseTarget } from '../outbound.js'
import {
  firstString,
  readMessageTarget,
  resolveShadowInteractiveBlock,
  validateApprovalMessageContent,
} from './interactive.js'
import { sendShadowMessage } from './send.js'
import { shadowMessageToolSchemaProperties } from './typebox-schema.js'

const SHADOW_DISCOVERED_ACTIONS = ['send', 'upload-file', 'react', 'edit', 'delete'] as const

const SHADOW_HANDLED_ACTIONS = [...SHADOW_DISCOVERED_ACTIONS, 'get-connection-status'] as const

type ShadowActionResult = {
  content: Array<{ type: 'text'; text: string }>
  details: Record<string, unknown>
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

async function uploadShadowAttachment(params: {
  client: ShadowClient
  to: string
  messageId: string
  actionParams: Record<string, unknown>
}) {
  const contentType = readAttachmentContentType(params.actionParams)
  const filename = readAttachmentFilename(params.actionParams)
  const uploadTarget = parseTarget(params.to).dmChannelId
    ? { dmMessageId: params.messageId }
    : params.messageId
  const base64Buffer = firstString(params.actionParams.buffer)
  const mediaUrl = readAttachmentSource(params.actionParams)

  if (base64Buffer) {
    const raw = base64Buffer.includes(',') ? (base64Buffer.split(',')[1] ?? '') : base64Buffer
    if (!raw) throw new Error('Invalid base64 attachment payload')
    const bytes = Buffer.from(raw, 'base64')
    const blob = new Blob([Uint8Array.from(bytes)], { type: contentType })
    await params.client.uploadMedia(blob, filename, contentType, uploadTarget)
    return { filename, contentType, source: 'buffer' as const }
  }

  if (mediaUrl) {
    await params.client.uploadMediaFromUrl(mediaUrl, uploadTarget)
    return { filename, contentType, source: 'media' as const, mediaUrl }
  }

  throw new Error('No buffer or media URL provided for attachment')
}

export const shadowMessageActions = {
  describeMessageTool: () =>
    ({
      actions: [...SHADOW_DISCOVERED_ACTIONS],
      capabilities: ['interactive'],
      schema: {
        visibility: 'current-channel',
        properties: shadowMessageToolSchemaProperties,
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
      },
    }) as unknown as ReturnType<
      NonNullable<import('openclaw/plugin-sdk').ChannelPlugin['actions']>['describeMessageTool']
    >,

  messageActionTargetAliases: {
    'upload-file': { aliases: ['recipient', 'to', 'channelId'] },
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
        const hasAttachment = hasAttachmentPayload(params)
        const content =
          firstString(params.message, params.content, params.text, params.caption, params.prompt) ??
          (interactiveBlock ? '[interactive]' : '')
        if (!content.trim() && !interactiveBlock && !hasAttachment) {
          return textResult({ ok: false, error: 'message or attachment is required' })
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
          metadata: interactiveBlock ? { interactive: interactiveBlock } : undefined,
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
          attachment: !!attachment,
          filename: attachment?.filename,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    if (action === 'upload-file') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        if (!to) return textResult({ ok: false, error: 'target is required' })
        if (!hasAttachmentPayload(params)) {
          return textResult({
            ok: false,
            error: 'upload-file requires buffer, media, path, or filePath',
          })
        }
        const text = firstString(params.message, params.content, params.text, params.caption) ?? ''
        const message = await sendShadowMessage({
          client,
          to,
          content: text || '\u200B',
          threadId: params.threadId as string | undefined,
          replyToId:
            (params.replyTo as string | undefined) ?? (params.replyToId as string | undefined),
        })
        const attachment = await uploadShadowAttachment({
          client,
          to,
          messageId: message.id,
          actionParams: params,
        })

        return textResult({
          ok: true,
          action: requestedAction,
          canonicalAction: 'upload-file',
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
