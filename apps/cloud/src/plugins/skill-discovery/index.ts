import {
  attachConnectorRuntimeAssets,
  connectorManifest,
  installedCheck,
  npmGlobalDependency,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'

const manifest = connectorManifest({
  id: 'skill-discovery',
  name: 'Skill Discovery',
  description:
    'Skill Discovery helps Buddies find, evaluate, and recommend installable agent skills from the open skills ecosystem before new capabilities are added.',
  category: 'automation',
  icon: 'search',
  website: 'https://skills.sh/vercel-labs/skills/find-skills',
  docs: 'https://github.com/vercel-labs/skills',
  fields: [],
  authType: 'none',
  capabilities: ['tool', 'data-source', 'cli'],
  tags: ['skills', 'discovery', 'marketplace', 'recommendations', 'cli'],
  popularity: 87,
})

const runtimeDependencies = [
  npmGlobalDependency('skills', ['skills'], 'Skills CLI for discovery and installation workflows'),
]

const skillSources = [
  {
    id: 'find-skills-skill',
    kind: 'git' as const,
    url: 'https://github.com/vercel-labs/skills.git',
    ref: 'main',
    from: 'skills',
    targetPath: '/workspace/.agents/plugin-skills/skill-discovery',
    include: ['find-skills'],
    description: 'Find Skills discovery workflow',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'skills',
      command: 'skills',
      description: 'Skills CLI for searching, listing, adding, and updating agent skills',
    },
  ],
  runtimeDependencies,
  skillSources,
  verificationChecks: [
    installedCheck('skills-cli-installed', 'Skills CLI installed', ['skills', '--version']),
    {
      id: 'find-skills-mounted',
      label: 'Find Skills skill mounted',
      kind: 'command',
      command: [
        'test',
        '-f',
        '/workspace/.agents/plugin-skills/skill-discovery/find-skills/SKILL.md',
      ],
      timeoutMs: 5_000,
      risk: 'safe',
    },
  ],
  prompt:
    'Use Skill Discovery to search for installable agent skills, compare sources, and recommend high-trust options. Do not install or update skills automatically unless the user explicitly approves the exact source.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources,
  skillsMountPath: '/workspace/.agents/plugin-skills/skill-discovery',
})
