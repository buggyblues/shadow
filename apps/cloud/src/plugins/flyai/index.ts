import {
  attachConnectorRuntimeAssets,
  connectorField,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'flyai',
  name: 'FlyAI',
  description:
    'FlyAI travel workflows for real-time flight, hotel, train, attraction, event, visa, cruise, car-rental, and itinerary planning search.',
  category: 'search',
  icon: 'plane',
  website: 'https://open.fly.ai',
  docs: 'https://github.com/alibaba-flyai/flyai-skill',
  fields: [
    connectorField('FLYAI_API_KEY', 'FlyAI API key', {
      description: 'Optional FlyAI API key for enhanced travel search results.',
      required: false,
      placeholder: 'FlyAI API key',
      helpUrl: 'https://github.com/alibaba-flyai/flyai-skill',
    }),
  ],
  authType: 'api-key',
  capabilities: ['tool', 'data-source', 'cli'],
  tags: ['flyai', 'fliggy', 'travel', 'flight', 'hotel', 'train', 'poi', 'skills'],
  popularity: 94,
})

const runtimeDependencies = [
  npmGlobalDependency('flyai', ['@fly-ai/flyai-cli'], 'FlyAI travel search CLI'),
]

const skillSources = [
  {
    id: 'flyai-skills',
    kind: 'git' as const,
    url: 'https://github.com/alibaba-flyai/flyai-skill.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/flyai',
    includePattern: 'flyai',
    description: 'Official FlyAI travel skill',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'flyai',
      command: 'flyai',
      description: 'FlyAI CLI for Fliggy travel inventory search',
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('flyai-cli-installed', 'FlyAI CLI installed', ['flyai', '--help']),
    {
      id: 'flyai-skill-mounted',
      label: 'FlyAI skill mounted',
      kind: 'command',
      command: ['test', '-f', '/workspace/.agents/plugin-skills/flyai/flyai/SKILL.md'],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use FlyAI for travel search and planning across flights, hotels, trains, attractions, event tickets, visas, cruises, car rentals, and itinerary comparison. Prefer read/search workflows unless the user explicitly asks to book.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/flyai',
})
