export type RuntimeSlashDispatch = 'agent' | 'passthrough'

export interface RuntimeSlashCommand {
  name: string
  description?: string
  aliases?: string[]
  packId?: string
  sourcePath?: string
  body?: string
  dispatch?: RuntimeSlashDispatch
}

export interface NativeSlashCommandSpec {
  name: string
  description: string
  aliases?: string[]
}

const CC_CONNECT_RESERVED_SLASH_NAMES = new Set([
  'new',
  'list',
  'sessions',
  'switch',
  'name',
  'rename',
  'current',
  'status',
  'usage',
  'quota',
  'history',
  'allow',
  'model',
  'reasoning',
  'effort',
  'mode',
  'lang',
  'quiet',
  'provider',
  'memory',
  'cron',
  'heartbeat',
  'hb',
  'compress',
  'compact',
  'stop',
  'help',
  'version',
  'commands',
  'command',
  'cmd',
  'skills',
  'skill',
  'config',
  'doctor',
  'upgrade',
  'update',
  'restart',
  'alias',
  'delete',
  'del',
  'rm',
  'bind',
  'search',
  'find',
  'shell',
  'sh',
  'exec',
  'run',
  'show',
  'dir',
  'cd',
  'chdir',
  'workdir',
  'tts',
  'workspace',
  'ws',
  'whoami',
  'myid',
  'web',
  'diff',
  'ps',
  'btw',
])

function normalizeName(name: string): string {
  return name.trim().replace(/^\//, '').toLowerCase()
}

export function ccConnectNativeCommandCatalog(params: {
  packId: string
  runtimeName: string
  sourcePath: string
  commands: NativeSlashCommandSpec[]
}): RuntimeSlashCommand[] {
  return params.commands
    .filter((command) => !CC_CONNECT_RESERVED_SLASH_NAMES.has(normalizeName(command.name)))
    .map((command) => ({
      name: normalizeName(command.name),
      description: command.description,
      aliases: command.aliases
        ?.map(normalizeName)
        .filter((alias) => !CC_CONNECT_RESERVED_SLASH_NAMES.has(alias)),
      packId: params.packId,
      sourcePath: params.sourcePath,
      body: [
        `The Shadow user invoked the ${params.runtimeName} native slash command /${normalizeName(command.name)}.`,
        `Treat this as a ${params.runtimeName} command request inside the current cc-connect session.`,
        'If the native command requires an interactive terminal control path that cc-connect cannot execute directly, explain the closest supported cc-connect command or current limitation.',
      ].join('\n'),
    }))
}
