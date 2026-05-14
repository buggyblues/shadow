import { ccConnectNativeCommandCatalog, type NativeSlashCommandSpec } from './types.js'

export const CODEX_SLASH_COMMANDS_SOURCE = 'https://developers.openai.com/codex/cli/slash-commands'

export const codexNativeSlashCommandSpecs: NativeSlashCommandSpec[] = [
  { name: 'permissions', description: 'Set what Codex can do without asking first.' },
  { name: 'sandbox-add-read-dir', description: 'Grant sandbox read access to an extra directory.' },
  { name: 'status', description: 'Inspect Codex session status.' },
  { name: 'statusline', description: 'Configure footer/status line items.' },
  { name: 'compact', description: 'Compact the current transcript.' },
  { name: 'clear', description: 'Clear the terminal view.' },
  { name: 'new', description: 'Start a new conversation without clearing the terminal.' },
  { name: 'copy', description: 'Copy the latest completed Codex output.' },
  { name: 'diff', description: 'Inspect the current git diff.' },
  { name: 'exit', description: 'Exit the Codex CLI.', aliases: ['quit'] },
  { name: 'experimental', description: 'Toggle experimental features.' },
  { name: 'feedback', description: 'Send diagnostics to Codex maintainers.' },
  { name: 'init', description: 'Generate AGENTS.md project instructions.' },
  { name: 'apps', description: 'Browse apps and insert them into the prompt.' },
  { name: 'plugins', description: 'Browse installed and discoverable plugins.' },
  { name: 'review', description: 'Ask Codex to review the working tree.' },
  { name: 'mcp', description: 'List MCP tools and server diagnostics.' },
  { name: 'mention', description: 'Attach a file to the conversation.' },
  { name: 'model', description: 'Choose the active model.' },
  { name: 'fast', description: 'Toggle Fast mode for supported models.' },
  { name: 'plan', description: 'Switch to plan mode.' },
  { name: 'goal', description: 'Set or view an experimental task goal.' },
  { name: 'personality', description: 'Set a response communication style.' },
  { name: 'ps', description: 'Show experimental background terminals.' },
  { name: 'stop', description: 'Stop all background terminals.' },
  { name: 'fork', description: 'Fork the current conversation into a new thread.' },
  { name: 'side', description: 'Start an ephemeral side conversation.' },
  { name: 'resume', description: 'Resume a saved conversation.' },
  { name: 'agent', description: 'Switch between Codex agent threads.' },
  { name: 'logout', description: 'Sign out of Codex.' },
  { name: 'debug-config', description: 'Print config layer diagnostics.' },
  { name: 'title', description: 'Configure terminal title fields.' },
  { name: 'keymap', description: 'Remap TUI keyboard shortcuts.' },
]

export const codexSlashCommands = ccConnectNativeCommandCatalog({
  packId: 'codex',
  runtimeName: 'Codex CLI',
  sourcePath: CODEX_SLASH_COMMANDS_SOURCE,
  commands: codexNativeSlashCommandSpecs,
})
