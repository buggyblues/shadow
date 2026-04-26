import { readFileSync, writeFileSync } from 'node:fs'

const manifestPath = process.argv[2] ?? 'extensions/shadowob/openclaw.plugin.json'

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

manifest.channelEnvVars = {
  ...(manifest.channelEnvVars ?? {}),
  shadowob: manifest.channelEnvVars?.shadowob ?? ['SHADOW_SERVER_URL', 'SHADOW_AGENT_TOKEN'],
}

manifest.channelConfigs = {
  ...(manifest.channelConfigs ?? {}),
  shadowob: manifest.channelConfigs?.shadowob ?? {
    label: 'ShadowOwnBuddy',
    description: 'Shadow server channel integration - chat with AI agents in Shadow channels',
    schema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        token: { type: 'string' },
        serverUrl: { type: 'string' },
        buddyId: { type: 'string' },
        buddyName: { type: 'string' },
        buddyDescription: { type: 'string' },
        replyToMode: { type: 'string', enum: ['first', 'all', 'off'] },
        accountAgentMap: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        accounts: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            additionalProperties: true,
            properties: {
              enabled: { type: 'boolean' },
              token: { type: 'string' },
              serverUrl: { type: 'string' },
              buddyId: { type: 'string' },
              buddyName: { type: 'string' },
              buddyDescription: { type: 'string' },
              agentId: { type: 'string' },
            },
          },
        },
      },
    },
    uiHints: {
      token: {
        label: 'Agent Token',
        sensitive: true,
        placeholder: 'Paste the JWT token generated in Shadow -> Agents',
      },
      serverUrl: {
        label: 'Server URL',
        placeholder: 'https://shadowob.com',
      },
      enabled: {
        label: 'Enabled',
      },
    },
  },
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
