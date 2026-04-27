import type { ShadowClient, ShadowMessage } from '@shadowob/sdk'
import type { ShadowRuntimeLogger, ShadowSlashCommand } from '../types.js'

export async function buildInteractiveResponseContext(params: {
  message: ShadowMessage
  client: ShadowClient
  runtime: ShadowRuntimeLogger
  slashCommands?: ShadowSlashCommand[]
}) {
  const response = (
    params.message as {
      metadata?: {
        interactiveResponse?: {
          sourceMessageId?: string
          blockId?: string
          actionId?: string
          value?: string
          values?: Record<string, string>
        }
      }
    }
  ).metadata?.interactiveResponse
  if (!response?.sourceMessageId) return { text: '', fields: {} as Record<string, unknown> }

  let source: ShadowMessage | null = null
  try {
    source = await params.client.getMessage(response.sourceMessageId)
  } catch (err) {
    params.runtime.error?.(
      `[interactive] Failed to load source message ${response.sourceMessageId}: ${String(err)}`,
    )
  }

  const sourceInteractive = (source as { metadata?: { interactive?: unknown } } | null)?.metadata
    ?.interactive
  const sourceSlashCommand = (source as { metadata?: { slashCommand?: unknown } } | null)?.metadata
    ?.slashCommand
  const sourceCommandName =
    sourceSlashCommand &&
    typeof sourceSlashCommand === 'object' &&
    !Array.isArray(sourceSlashCommand)
      ? (sourceSlashCommand as Record<string, unknown>).name
      : undefined
  const sourceCommand =
    typeof sourceCommandName === 'string'
      ? params.slashCommands?.find(
          (command) => command.name.toLowerCase() === sourceCommandName.toLowerCase(),
        )
      : undefined
  const sourcePrompt =
    sourceInteractive && typeof sourceInteractive === 'object' && !Array.isArray(sourceInteractive)
      ? (sourceInteractive as Record<string, unknown>).prompt
      : undefined
  const responsePrompt =
    sourceInteractive && typeof sourceInteractive === 'object' && !Array.isArray(sourceInteractive)
      ? (sourceInteractive as Record<string, unknown>).responsePrompt
      : undefined

  const lines = [
    'Shadow interactive response received.',
    `Source message: ${source?.content ?? '(unavailable)'}`,
    typeof sourcePrompt === 'string' && sourcePrompt.trim()
      ? `Source prompt: ${sourcePrompt.trim()}`
      : '',
    typeof responsePrompt === 'string' && responsePrompt.trim()
      ? `Follow-up instruction: ${responsePrompt.trim()}`
      : '',
    sourceCommand?.body ? `Source slash command definition:\n${sourceCommand.body}` : '',
    `Action: ${response.actionId ?? '(unknown)'}`,
    response.values ? `Submitted values:\n${JSON.stringify(response.values, null, 2)}` : '',
  ].filter(Boolean)

  return {
    text: lines.join('\n\n'),
    fields: {
      InteractiveResponse: response,
      ...(source ? { InteractiveSourceMessage: source.content } : {}),
      ...(sourceInteractive ? { InteractiveSourceBlock: sourceInteractive } : {}),
      ...(sourceCommand ? { InteractiveSourceSlashCommand: sourceCommand } : {}),
    } as Record<string, unknown>,
  }
}
