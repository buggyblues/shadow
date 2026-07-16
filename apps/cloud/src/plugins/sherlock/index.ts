import {
  attachConnectorRuntimeAssets,
  connectorManifest,
  installedCheck,
} from '../connector-kit.js'
import { defineConnectorPlugin } from '../helpers.js'
import type { PluginRuntimeDependency } from '../types.js'

const RUNTIME_MOUNT = '/opt/shadow-plugin-deps/sherlock'

const manifest = connectorManifest({
  id: 'sherlock',
  name: 'Sherlock',
  description:
    'Sherlock hunts for social media accounts by username across hundreds of social networks for OSINT and identity research workflows.',
  category: 'search',
  icon: 'search-code',
  website: 'https://github.com/sherlock-project/sherlock',
  docs: 'https://sherlockproject.xyz/',
  fields: [],
  authType: 'none',
  capabilities: ['tool', 'data-source', 'cli'],
  tags: ['sherlock', 'osint', 'username', 'social', 'search', 'reconnaissance'],
  popularity: 89,
})

const runtimeDependencies: PluginRuntimeDependency[] = [
  {
    id: 'sherlock-python-prereqs',
    kind: 'system-package',
    packages: ['python3', 'py3-pip', 'py3-virtualenv'],
    description: 'Python runtime for Sherlock',
  },
  {
    id: 'sherlock',
    kind: 'shell',
    command: [
      `mkdir -p '${RUNTIME_MOUNT}/bin' && python3 -m venv '${RUNTIME_MOUNT}/venv' && '${RUNTIME_MOUNT}/venv/bin/pip' install --no-cache-dir sherlock-project && ln -sf ../venv/bin/sherlock '${RUNTIME_MOUNT}/bin/sherlock'`,
    ],
    binPath: `${RUNTIME_MOUNT}/bin/sherlock`,
    description: 'Sherlock username OSINT CLI',
  },
]

const plugin = defineConnectorPlugin(manifest, {
  cli: [
    {
      name: 'sherlock',
      command: 'sherlock',
      description: 'Sherlock CLI for finding usernames across social networks',
    },
  ],
  runtimeDependencies,
  verificationChecks: [
    installedCheck('sherlock-cli-installed', 'Sherlock CLI installed', ['sherlock', '--version']),
  ],
  prompt:
    'Use Sherlock for public username discovery across social networks. Treat results as unverified OSINT signals, avoid doxxing or harassment workflows, and ask before running broad scans on private individuals.',
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  runtimeImage: 'node:22-bookworm-slim',
  runtimeMountPath: RUNTIME_MOUNT,
  initRuntimeMountPath: RUNTIME_MOUNT,
  sanityCommands: [`test -x '${RUNTIME_MOUNT}/bin/sherlock'`],
})
