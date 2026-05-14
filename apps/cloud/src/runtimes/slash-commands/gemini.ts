import { ccConnectNativeCommandCatalog, type NativeSlashCommandSpec } from './types.js'

export const GEMINI_SLASH_COMMANDS_SOURCE =
  'https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md'

export const geminiNativeSlashCommandSpecs: NativeSlashCommandSpec[] = [
  { name: 'about', description: 'Show Gemini CLI version information.' },
  { name: 'agents', description: 'Manage local and remote subagents.' },
  { name: 'auth', description: 'Change authentication method.' },
  { name: 'bug', description: 'File a Gemini CLI issue.' },
  { name: 'chat', description: 'Browse, save, resume, and share chats.' },
  { name: 'clear', description: 'Clear terminal screen and scrollback.' },
  { name: 'commands', description: 'Manage custom slash commands.' },
  { name: 'compress', description: 'Replace chat context with a summary.' },
  { name: 'copy', description: 'Copy the last output to clipboard.' },
  { name: 'directory', description: 'Manage multi-directory workspace support.' },
  { name: 'docs', description: 'Open Gemini CLI documentation.' },
  { name: 'editor', description: 'Select the external editor.' },
  { name: 'extensions', description: 'Manage Gemini CLI extensions.' },
  { name: 'help', description: 'Display Gemini CLI help.' },
  { name: 'hooks', description: 'Manage lifecycle hooks.' },
  { name: 'ide', description: 'Manage IDE integration.' },
  { name: 'init', description: 'Generate a tailored GEMINI.md context file.' },
  { name: 'mcp', description: 'Manage configured MCP servers.' },
  { name: 'memory', description: 'Manage hierarchical GEMINI.md memory.' },
  { name: 'model', description: 'Manage model configuration.' },
  { name: 'permissions', description: 'Manage folder trust and other permissions.' },
  { name: 'plan', description: 'Switch to Plan Mode and view the current plan.' },
  { name: 'policies', description: 'List active policies by mode.' },
  { name: 'privacy', description: 'Display privacy notice and data collection consent.' },
  { name: 'quit', description: 'Exit Gemini CLI.', aliases: ['exit'] },
  { name: 'restore', description: 'Restore project files to a pre-tool checkpoint.' },
  { name: 'rewind', description: 'Navigate backward through conversation history.' },
  { name: 'resume', description: 'Browse and resume previous conversation sessions.' },
  { name: 'settings', description: 'Open the settings editor.' },
  { name: 'shells', description: 'Toggle the background shells view.', aliases: ['bashes'] },
  { name: 'setup-github', description: 'Set up GitHub Actions for triage and reviews.' },
  { name: 'skills', description: 'Manage Gemini Agent Skills.' },
  { name: 'stats', description: 'Show current session statistics.' },
  { name: 'terminal-setup', description: 'Configure multiline input keybindings.' },
  { name: 'theme', description: 'Change the visual theme.' },
  { name: 'tools', description: 'Display available tools.' },
  { name: 'upgrade', description: 'Open the Gemini Code Assist upgrade page.' },
  { name: 'vim', description: 'Toggle Vim mode.' },
]

export const geminiSlashCommands = ccConnectNativeCommandCatalog({
  packId: 'gemini',
  runtimeName: 'Gemini CLI',
  sourcePath: GEMINI_SLASH_COMMANDS_SOURCE,
  commands: geminiNativeSlashCommandSpecs,
})
