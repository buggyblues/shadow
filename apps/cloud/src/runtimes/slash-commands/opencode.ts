import { ccConnectNativeCommandCatalog, type NativeSlashCommandSpec } from './types.js'

export const OPENCODE_SLASH_COMMANDS_SOURCE = 'https://opencode.ai/docs/tui/'

export const openCodeNativeSlashCommandSpecs: NativeSlashCommandSpec[] = [
  { name: 'connect', description: 'Add a model provider to OpenCode.' },
  { name: 'compact', description: 'Compact the current session.', aliases: ['summarize'] },
  { name: 'details', description: 'Toggle tool execution details.' },
  { name: 'editor', description: 'Open the external editor for composing messages.' },
  { name: 'exit', description: 'Exit OpenCode.', aliases: ['quit', 'q'] },
  { name: 'export', description: 'Export the current conversation to Markdown.' },
  { name: 'help', description: 'Show the OpenCode help dialog.' },
  { name: 'init', description: 'Guided setup for AGENTS.md rules.' },
  { name: 'models', description: 'List available models.' },
  { name: 'new', description: 'Start a new session.', aliases: ['clear'] },
  { name: 'redo', description: 'Redo a previously undone message.' },
  { name: 'sessions', description: 'List and switch sessions.', aliases: ['resume', 'continue'] },
  { name: 'share', description: 'Share the current session.' },
  { name: 'themes', description: 'List available themes.' },
  { name: 'thinking', description: 'Toggle visibility of thinking/reasoning blocks.' },
  { name: 'undo', description: 'Undo the last message and file changes.' },
  { name: 'unshare', description: 'Unshare the current session.' },
]

export const openCodeSlashCommands = ccConnectNativeCommandCatalog({
  packId: 'opencode',
  runtimeName: 'OpenCode',
  sourcePath: OPENCODE_SLASH_COMMANDS_SOURCE,
  commands: openCodeNativeSlashCommandSpecs,
})
