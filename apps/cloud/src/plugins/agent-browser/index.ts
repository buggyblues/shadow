import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'agent-browser',
  name: 'Agent Browser',
  description:
    'Agent Browser gives Buddies a browser automation CLI for QA, login flows, screenshots, scraping, visual checks, Electron apps, Slack automation, and remote browser sessions.',
  category: 'automation',
  icon: 'mouse-pointer-click',
  website: 'https://skills.sh/vercel-labs/agent-browser/agent-browser',
  docs: 'https://github.com/vercel-labs/agent-browser',
  fields: [
    connectorField('AGENT_BROWSER_PROVIDER', 'Browser provider', {
      description: 'Optional remote browser provider.',
      required: false,
      sensitive: false,
      placeholder: 'browserless, browserbase, browseruse, kernel, agentcore',
    }),
    connectorField('BROWSERLESS_API_KEY', 'Browserless API key', {
      description: 'Optional Browserless API key.',
      required: false,
      placeholder: 'Browserless API key',
      helpUrl: 'https://browserless.io',
    }),
    connectorField('BROWSERBASE_API_KEY', 'Browserbase API key', {
      description: 'Optional Browserbase API key.',
      required: false,
      placeholder: 'Browserbase API key',
      helpUrl: 'https://browserbase.com',
    }),
    connectorField('BROWSER_USE_API_KEY', 'Browser Use API key', {
      description: 'Optional Browser Use Cloud API key.',
      required: false,
      placeholder: 'Browser Use API key',
      helpUrl: 'https://cloud.browser-use.com/settings?tab=api-keys',
    }),
    connectorField('KERNEL_API_KEY', 'Kernel API key', {
      description: 'Optional Kernel API key.',
      required: false,
      placeholder: 'Kernel API key',
      helpUrl: 'https://dashboard.onkernel.com',
    }),
    connectorField('AGENT_BROWSER_STORAGE_STATE_JSON', 'Browser storage state', {
      description:
        'Optional Playwright storageState JSON for reusing browser cookies and localStorage.',
      required: false,
      placeholder: '{"cookies":[],"origins":[]}',
    }),
  ],
  authType: 'api-key',
  capabilities: ['tool', 'data-source', 'action', 'cli'],
  tags: ['browser', 'automation', 'qa', 'scraping', 'screenshots', 'electron', 'slack', 'skills'],
  popularity: 90,
})

const runtimeDependencies = [
  npmGlobalDependency('agent-browser', ['agent-browser'], 'Agent Browser automation CLI'),
]

const skillSources = [
  {
    id: 'agent-browser-skill',
    kind: 'git' as const,
    url: 'https://github.com/vercel-labs/agent-browser.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/agent-browser',
    include: ['agent-browser'],
    description: 'Agent Browser skill stub and runtime workflow loader',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'agent-browser',
      command: 'agent-browser',
      description: 'Browser automation CLI for web, Electron, Slack, QA, and scraping workflows',
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('agent-browser-installed', 'Agent Browser CLI installed', [
      'agent-browser',
      '--version',
    ]),
    {
      id: 'agent-browser-skill-mounted',
      label: 'Agent Browser skill mounted',
      kind: 'command',
      command: [
        'test',
        '-f',
        '/workspace/.agents/plugin-skills/agent-browser/agent-browser/SKILL.md',
      ],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Agent Browser for browser automation, QA, screenshots, scraping, login flows, console/network checks, visual diffs, Electron apps, Slack automation, and remote browser sessions. Confirm actions before submitting forms, making purchases, posting messages, or changing account state.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/agent-browser',
})
