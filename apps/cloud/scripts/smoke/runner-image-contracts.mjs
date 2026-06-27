#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cloudRoot = resolve(here, '../..')

const runnerDockerfiles = [
  'images/openclaw-runner/Dockerfile',
  'images/codex-runner/Dockerfile',
  'images/claude-runner/Dockerfile',
  'images/opencode-runner/Dockerfile',
  'images/hermes-runner/Dockerfile',
]

const requiredDockerfileSnippets = [
  'COPY apps/cloud/images/shared/shadow-persistent-apt.sh /usr/local/bin/shadow-persistent-apt',
  'ln -sf /usr/local/bin/shadow-persistent-apt /usr/local/bin/apt',
  'ln -sf /usr/local/bin/shadow-persistent-apt /usr/local/bin/apt-get',
  'ln -sf /usr/bin/pip3 /usr/local/bin/pip',
  'ENV HOME=/home/shadow',
  'ENV PATH=/home/shadow/.local/bin:$PATH',
  'ENV NPM_CONFIG_PREFIX=/home/shadow/.local',
  'ENV npm_config_prefix=/home/shadow/.local',
  'ENV NPM_CONFIG_CACHE=/home/shadow/.cache/npm',
  'ENV npm_config_cache=/home/shadow/.cache/npm',
  'ENV PIP_CACHE_DIR=/home/shadow/.cache/pip',
  'ENV PIP_BREAK_SYSTEM_PACKAGES=1',
  'ENV PYTHONUSERBASE=/home/shadow/.local',
  'ENV XDG_CONFIG_HOME=/home/shadow/.config',
  'ENV XDG_CACHE_HOME=/home/shadow/.cache',
  'ENV XDG_DATA_HOME=/home/shadow/.local/share',
  'ENV XDG_STATE_HOME=/home/shadow/.local/state',
  'ENV SHADOWOB_PERSISTENT_TOOLS_DIR=/home/shadow/.shadow-tools',
  'ENV SHADOWOB_PERSISTENT_APT_ROOT=/home/shadow/.shadow-tools/apt',
  'ENV SHADOWOB_RUNNER_PERSISTENT_DIRS=',
  'ENV SHADOWOB_RUNNER_EPHEMERAL_DIRS=',
  'ENV SHADOWOB_RUNNER_TEMP_DIR=/tmp',
]

const requiredPythonPackages = ['python-is-python3', 'python3', 'python3-pip', 'python3-venv']
const forbiddenDockerfileSnippets = ['ENV npm_config_cache=/tmp/npm-cache']
const forbiddenContainerSnippets = [
  'CODEX_HOME_PATH',
  'CLAUDE_HOME_PATH',
  'OPENCODE_CONFIG_PATH',
  'runnerPersistentMountsForRuntime',
  'RUNNER_PERSISTENT_TOOL_SUBPATHS',
]
const forbiddenEntrypointSnippets = ['/tmp/npm-cache']

function fail(message) {
  throw new Error(`[runner-image-contracts] ${message}`)
}

function readCloudFile(relativePath) {
  return readFileSync(join(cloudRoot, relativePath), 'utf8')
}

for (const relativePath of runnerDockerfiles) {
  const source = readCloudFile(relativePath)
  for (const snippet of requiredDockerfileSnippets) {
    if (!source.includes(snippet)) fail(`${relativePath} is missing ${snippet}`)
  }
  for (const pkg of requiredPythonPackages) {
    if (!source.includes(pkg)) fail(`${relativePath} is missing ${pkg}`)
  }
  for (const snippet of forbiddenDockerfileSnippets) {
    if (source.includes(snippet)) fail(`${relativePath} still contains ${snippet}`)
  }
}

const containerSource = readCloudFile('src/runtimes/container.ts')
for (const snippet of forbiddenContainerSnippets) {
  if (containerSource.includes(snippet)) {
    fail(`src/runtimes/container.ts contains tool-specific persistence symbol ${snippet}`)
  }
}

if (containerSource.includes("'.codex'") || containerSource.includes('".codex"')) {
  fail('src/runtimes/container.ts should not define Codex-specific persistent mounts')
}

for (const relativePath of [
  'images/openclaw-runner/entrypoint.mjs',
  'images/cc-connect-runner/entrypoint.mjs',
  'images/hermes-runner/entrypoint.mjs',
]) {
  const source = readCloudFile(relativePath)
  for (const snippet of forbiddenEntrypointSnippets) {
    if (source.includes(snippet)) fail(`${relativePath} contains temporary npm cache ${snippet}`)
  }
}

console.log('[runner-image-contracts] ok')
