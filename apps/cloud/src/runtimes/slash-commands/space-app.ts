import type { RuntimeSlashCommand } from './types.js'

const SHADOWOB_APP_COMMANDS_SOURCE = 'shadow://skills/shadow-space-app'

export const shadowSpaceAppSlashCommands: RuntimeSlashCommand[] = [
  {
    name: 'create-app',
    description: 'Create, build, and publish a Space App from a short request.',
    aliases: ['app-create'],
    packId: 'space-app',
    sourcePath: SHADOWOB_APP_COMMANDS_SOURCE,
    dispatch: 'agent',
    body: [
      'The Shadow user invoked /create-app.',
      'Treat the rest of the message as the Space App request. Product-facing text must use the name Space App.',
      'Read the mounted shadow-space-app skill before creating files.',
      'Start from `shadowob space-app generate <app-key>` unless the user explicitly asks for a different stack.',
      'Create or keep the Space App source under `$SHADOWOB_WORKSPACE`, `/workspace`, or the Cloud runner home directory so publish metadata and backup tracking can accept the paths.',
      'Implement the requested Space App, run the local build, and start or verify the Space App service.',
      'Start or keep the Space App service as a non-blocking background process, then verify it with curl before publishing. When the scaffold provides `pnpm start:background`, use it. Do not leave a foreground server command such as `pnpm start` or `node src/server.js` blocking the task.',
      'Publish with `shadowob space-app publish --port <port> --manifest-file space-app.local.json --source-path "$PWD" --json`; the Cloud runtime should auto-detect deployment, agent, and the target server from the current Inbox/channel context.',
      'If Cloud publish cannot complete, mark the task failed with the exact blocker and keep the Space App source/build in the workspace.',
    ].join('\n'),
  },
  {
    name: 'update-app',
    description: 'Update, rebuild, and republish an existing Space App.',
    aliases: ['app-update'],
    packId: 'space-app',
    sourcePath: SHADOWOB_APP_COMMANDS_SOURCE,
    dispatch: 'agent',
    body: [
      'The Shadow user invoked /update-app.',
      'Treat the rest of the message as the Space App update request. Product-facing text must use the name Space App.',
      'Read the mounted shadow-space-app skill and inspect the existing Space App source before editing.',
      'Keep the Space App source under `$SHADOWOB_WORKSPACE`, `/workspace`, or the Cloud runner home directory so publish metadata and backup tracking can accept the paths.',
      'Make the smallest coherent change, run the local build/tests, and verify the Space App service still starts.',
      'Start or keep the Space App service as a non-blocking background process, then verify it with curl before republishing. When the scaffold provides `pnpm start:background`, use it. Do not leave a foreground server command such as `pnpm start` or `node src/server.js` blocking the task.',
      'Republish with `shadowob space-app publish --port <port> --manifest-file space-app.local.json --source-path "$PWD" --json`; the Cloud runtime should auto-detect deployment, agent, and the target server from the current Inbox/channel context.',
      'If Cloud publish cannot complete, mark the task failed with the exact blocker and keep the updated source/build in the workspace.',
    ].join('\n'),
  },
]

export function withShadowSpaceAppSlashCommands(
  commands: RuntimeSlashCommand[],
): RuntimeSlashCommand[] {
  return [...shadowSpaceAppSlashCommands, ...commands]
}
