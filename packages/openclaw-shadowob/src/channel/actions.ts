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

const SHADOW_DISCOVERED_ACTIONS = [
  'send',
  'sendAttachment',
  'react',
  'edit',
  'delete',
  'update-homepage',
  'get-server',
] as const

const SHADOW_HANDLED_ACTIONS = [
  ...SHADOW_DISCOVERED_ACTIONS,
  'send-interactive',
  'get-connection-status',
] as const

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

function readNullableHtml(params: Record<string, unknown>) {
  if (params.html === null || params.homepageHtml === null || params.homepage_html === null) {
    return null
  }
  return (
    (params.html as string | undefined) ??
    (params.homepageHtml as string | undefined) ??
    (params.homepage_html as string | undefined) ??
    null
  )
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
        sendAttachment: ['media', 'path', 'filePath', 'buffer'],
      },
    }) as unknown as ReturnType<
      NonNullable<import('openclaw/plugin-sdk').ChannelPlugin['actions']>['describeMessageTool']
    >,

  messageActionTargetAliases: {
    'send-interactive': { aliases: ['recipient'] },
    'get-server': { aliases: ['serverId', 'server_id', 'server'] },
    'update-homepage': { aliases: ['serverId', 'server_id', 'server'] },
  } as Record<string, { aliases: string[] }>,

  supportsAction: ({ action }: { action: string }): boolean =>
    (SHADOW_HANDLED_ACTIONS as readonly string[]).includes(action),

  handleAction: async (ctx: ChannelMessageActionContext) => {
    const account = getAccountConfig(ctx.cfg, ctx.accountId ?? DEFAULT_ACCOUNT_ID)
    if (!account) {
      return textResult({ ok: false, error: 'Shadow account not configured' })
    }

    const action = String(ctx.action)
    const { params } = ctx

    if (action === 'send') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        if (!to) return textResult({ ok: false, error: 'target is required' })

        const interactiveBlock = resolveShadowInteractiveBlock(params)
        const content =
          firstString(params.message, params.content, params.text, params.caption, params.prompt) ??
          (interactiveBlock ? '[interactive]' : '')
        if (!content.trim() && !interactiveBlock) {
          return textResult({ ok: false, error: 'message is required' })
        }
        const approvalError = validateApprovalMessageContent(content, interactiveBlock)
        if (approvalError) return textResult({ ok: false, error: approvalError })

        const message = await sendShadowMessage({
          client,
          to,
          content: content.trim() ? content : '[interactive]',
          threadId: params.threadId as string | undefined,
          replyToId:
            (params.replyTo as string | undefined) ?? (params.replyToId as string | undefined),
          metadata: interactiveBlock ? { interactive: interactiveBlock } : undefined,
        })

        return textResult({
          ok: true,
          action: 'send',
          messageId: message.id,
          interactive: !!interactiveBlock,
          kind: interactiveBlock?.kind,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    if (action === 'sendAttachment') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        const text = (params.message as string) ?? (params.caption as string) ?? ''
        const filename = (params.filename as string) || 'file'
        const contentType =
          (params.contentType as string) ||
          (params.mimeType as string) ||
          'application/octet-stream'
        const base64Buffer = params.buffer as string | undefined
        const mediaUrl =
          (params.media as string) ?? (params.path as string) ?? (params.filePath as string) ?? ''

        const { channelId, threadId: parsedThreadId, dmChannelId } = parseTarget(to)
        const threadId = (params.threadId as string) ?? parsedThreadId

        const content = text || '\u200B'
        let message: Awaited<ReturnType<typeof client.sendMessage>> | undefined
        if (dmChannelId) {
          message = await client.sendDmMessage(dmChannelId, content, {
            replyToId: params.replyTo as string | undefined,
          })
        } else if (threadId) {
          message = await client.sendToThread(threadId, content)
        } else if (channelId) {
          message = await client.sendMessage(channelId, content, {
            replyToId: params.replyTo as string | undefined,
          })
        } else {
          return textResult({
            ok: false,
            error: 'Could not resolve target channel, thread, or DM',
          })
        }

        if (base64Buffer) {
          const raw = base64Buffer.includes(',') ? (base64Buffer.split(',')[1] ?? '') : base64Buffer
          if (!raw) throw new Error('Invalid base64 attachment payload')
          const bytes = Buffer.from(raw, 'base64')
          const blob = new Blob([Uint8Array.from(bytes)], { type: contentType })
          await client.uploadMedia(
            blob,
            filename,
            contentType,
            dmChannelId ? { dmMessageId: message.id } : message.id,
          )
        } else if (mediaUrl) {
          await client.uploadMediaFromUrl(
            mediaUrl,
            dmChannelId ? { dmMessageId: message.id } : message.id,
          )
        } else {
          return textResult({
            ok: false,
            error: 'No buffer or media URL provided for attachment',
          })
        }

        return textResult({
          ok: true,
          action: 'sendAttachment',
          messageId: message.id,
          filename,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    if (action === 'send-interactive') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        const kind = (params.kind as string) ?? 'buttons'
        const prompt = (params.prompt as string) ?? (params.message as string) ?? ''
        if (!to) return textResult({ ok: false, error: 'target is required' })
        if (!['buttons', 'select', 'form', 'approval'].includes(kind)) {
          return textResult({ ok: false, error: `unsupported interactive kind: ${kind}` })
        }
        const block = resolveShadowInteractiveBlock({ ...params, kind, prompt })
        if (!block) return textResult({ ok: false, error: 'interactive block is required' })
        const blockId = String(block.id)
        const content = prompt && prompt.trim() ? prompt : '[interactive]'
        const approvalError = validateApprovalMessageContent(content, block)
        if (approvalError) return textResult({ ok: false, error: approvalError })
        const message = await sendShadowMessage({
          client,
          to,
          content,
          threadId: params.threadId as string | undefined,
          replyToId: params.replyTo as string | undefined,
          metadata: { interactive: block },
        })
        return textResult({
          ok: true,
          action: 'send-interactive',
          messageId: message.id,
          blockId,
          kind,
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

    if (action === 'get-server') {
      const serverId =
        (params.serverId as string) ??
        (params.server_id as string) ??
        (params.server as string) ??
        ''
      if (!serverId) {
        return textResult({ ok: false, error: 'serverId is required' })
      }
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const server = await client.getServer(serverId)
        return textResult({ ok: true, action: 'get-server', server })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    if (action === 'update-homepage') {
      const serverId =
        (params.serverId as string) ??
        (params.server_id as string) ??
        (params.server as string) ??
        ''
      const html = readNullableHtml(params)
      if (!serverId) {
        return textResult({ ok: false, error: 'serverId is required' })
      }
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const result = await client.updateServerHomepage(serverId, html)
        return textResult({
          ok: true,
          action: 'update-homepage',
          serverId: result.id,
          slug: result.slug,
          homepageHtml: result.homepageHtml ? `(${result.homepageHtml.length} chars)` : null,
        })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
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
