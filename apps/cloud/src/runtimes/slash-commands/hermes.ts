import type { RuntimeSlashCommand } from './types.js'

export const HERMES_SLASH_COMMANDS_SOURCE =
  'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/slash-commands.md'

const hermesMessagingCommands = [
  { name: 'new', description: 'Start a new conversation.' },
  { name: 'reset', description: 'Reset conversation history.' },
  { name: 'status', description: 'Show session information.' },
  { name: 'stop', description: 'Interrupt the running agent.' },
  { name: 'model', description: 'Show or change the model.' },
  { name: 'codex-runtime', description: 'Toggle Hermes Codex app-server runtime.' },
  { name: 'personality', description: 'Set a personality overlay for the session.' },
  { name: 'fast', description: 'Toggle fast mode.' },
  { name: 'retry', description: 'Retry the last message.' },
  { name: 'undo', description: 'Remove the last exchange.' },
  { name: 'sethome', description: 'Mark the current chat as the platform home channel.' },
  { name: 'compress', description: 'Compress conversation context.' },
  { name: 'title', description: 'Set or show the session title.' },
  { name: 'resume', description: 'Resume a named session.' },
  { name: 'usage', description: 'Show token usage and cost breakdown.' },
  { name: 'insights', description: 'Show usage analytics.' },
  { name: 'reasoning', description: 'Change reasoning effort or display.' },
  { name: 'voice', description: 'Control spoken replies.' },
  { name: 'rollback', description: 'List or restore filesystem checkpoints.' },
  { name: 'background', description: 'Run a prompt in a background session.' },
  { name: 'queue', description: 'Queue a prompt for the next turn.' },
  { name: 'steer', description: 'Inject mid-run steering after the next tool call.' },
  { name: 'goal', description: 'Set a standing goal for auto-continuation.' },
  { name: 'footer', description: 'Toggle runtime metadata footers.' },
  { name: 'curator', description: 'Control background skill maintenance.' },
  { name: 'kanban', description: 'Drive the Hermes kanban command surface.' },
  { name: 'reload-mcp', description: 'Reload MCP servers from config.', aliases: ['reload_mcp'] },
  { name: 'yolo', description: 'Toggle no-approval mode.' },
  { name: 'commands', description: 'Browse all commands and skills.' },
  { name: 'approve', description: 'Approve a pending dangerous command.' },
  { name: 'deny', description: 'Reject a pending dangerous command.' },
  { name: 'update', description: 'Update Hermes Agent.' },
  { name: 'restart', description: 'Gracefully restart the gateway.' },
  { name: 'debug', description: 'Upload a debug report.' },
  { name: 'help', description: 'Show messaging help.' },
]

export const hermesSlashCommands: RuntimeSlashCommand[] = hermesMessagingCommands.map(
  (command) => ({
    ...command,
    packId: 'hermes',
    sourcePath: HERMES_SLASH_COMMANDS_SOURCE,
  }),
)
