import type { RuntimeSlashCommand } from './types.js'

const SHADOW_APP_COMMANDS_SOURCE = 'shadow://skills/shadow-server-app'

export const shadowAppSlashCommands: RuntimeSlashCommand[] = [
  {
    name: 'create-app',
    description: 'Create, build, and publish a Shadow App from a short request.',
    aliases: ['app-create'],
    packId: 'shadow-app',
    sourcePath: SHADOW_APP_COMMANDS_SOURCE,
    dispatch: 'agent',
    body: [
      'The Shadow user invoked /create-app.',
      'Treat the rest of the message as the App request. Product-facing text must use the name App.',
      'Read the mounted shadow-server-app skill before creating files.',
      'Start from `shadowob app generate <app-key>` unless the user explicitly asks for a different stack.',
      'Create or keep the App source under `$SHADOW_WORKSPACE`, `/workspace`, or the Cloud runner home directory so publish metadata and backup tracking can accept the paths.',
      'Implement the requested App, run the local build, and start or verify the App service.',
      'Start or keep the App service as a non-blocking background process, then verify it with curl before publishing. When the scaffold provides `pnpm start:background`, use it. Do not leave a foreground server command such as `pnpm start` or `node src/server.js` blocking the task.',
      'Publish with `shadowob cloud app publish --port <port> --manifest-file shadow-app.local.json --source-path "$PWD" --json`; the Cloud runtime should auto-detect deployment, agent, and the target server from the current Inbox/channel context.',
      'If Cloud publish cannot complete, mark the task failed with the exact blocker and keep the App source/build in the workspace.',
    ].join('\n'),
  },
  {
    name: 'update-app',
    description: 'Update, rebuild, and republish an existing Shadow App.',
    aliases: ['app-update'],
    packId: 'shadow-app',
    sourcePath: SHADOW_APP_COMMANDS_SOURCE,
    dispatch: 'agent',
    body: [
      'The Shadow user invoked /update-app.',
      'Treat the rest of the message as the App update request. Product-facing text must use the name App.',
      'Read the mounted shadow-server-app skill and inspect the existing App source before editing.',
      'Keep the App source under `$SHADOW_WORKSPACE`, `/workspace`, or the Cloud runner home directory so publish metadata and backup tracking can accept the paths.',
      'Make the smallest coherent change, run the local build/tests, and verify the App service still starts.',
      'Start or keep the App service as a non-blocking background process, then verify it with curl before republishing. When the scaffold provides `pnpm start:background`, use it. Do not leave a foreground server command such as `pnpm start` or `node src/server.js` blocking the task.',
      'Republish with `shadowob cloud app publish --port <port> --manifest-file shadow-app.local.json --source-path "$PWD" --json`; the Cloud runtime should auto-detect deployment, agent, and the target server from the current Inbox/channel context.',
      'If Cloud publish cannot complete, mark the task failed with the exact blocker and keep the updated source/build in the workspace.',
    ].join('\n'),
  },
]

export function withShadowAppSlashCommands(commands: RuntimeSlashCommand[]): RuntimeSlashCommand[] {
  return [...shadowAppSlashCommands, ...commands]
}
