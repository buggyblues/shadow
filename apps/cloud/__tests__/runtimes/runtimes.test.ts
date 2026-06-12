import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import '../../src/runtimes/loader.js'
import { DEFAULT_RUNNER_IMAGE_TAG } from '../../src/runtimes/images.js'
import { getAllRuntimes, getRuntime, getRuntimeIds } from '../../src/runtimes/index.js'

const EXPECTED_RUNTIMES = ['openclaw', 'claude-code', 'codex', 'opencode', 'hermes']
const RUNNER_DOCKERFILES = [
  'openclaw-runner',
  'claude-runner',
  'codex-runner',
  'opencode-runner',
  'hermes-runner',
]
const CC_CONNECT_THREAD_COORDINATION_REF = '9d0e7f8b951d12ab61173302149fbb09115f5523'
const EXPECTED_BROWSER_ENV = [
  { name: 'PLAYWRIGHT_BROWSERS_PATH', value: '/ms-playwright' },
  { name: 'CHROME_BIN', value: '/usr/bin/chromium' },
  { name: 'CHROMIUM_PATH', value: '/usr/bin/chromium' },
  { name: 'PUPPETEER_EXECUTABLE_PATH', value: '/usr/bin/chromium' },
]

describe('Runtime registry', () => {
  it('registers all phase-1 runtimes', () => {
    expect(getRuntimeIds()).toEqual(expect.arrayContaining(EXPECTED_RUNTIMES))
  })

  it('returns runtime adapters by ID', () => {
    const adapter = getRuntime('claude-code')
    expect(adapter).toMatchObject({
      id: 'claude-code',
      name: expect.stringContaining('Claude'),
      runtimeKind: 'cc-connect',
      defaultImage: `ghcr.io/buggyblues/claude-runner:${DEFAULT_RUNNER_IMAGE_TAG}`,
    })
  })

  it('throws for unknown runtime IDs', () => {
    expect(() => getRuntime('unknown-runtime')).toThrow('Unknown runtime "unknown-runtime"')
  })

  it('does not expose no-op OpenClaw adapter hooks on native runtimes', () => {
    for (const adapter of getAllRuntimes()) {
      const shape = adapter as unknown as Record<string, unknown>
      expect(shape.acpRuntime).toBeUndefined()
      expect(shape.applyConfig).toBeUndefined()
      expect(shape.extraEnv).toBeUndefined()
      expect(shape.packages).toBeUndefined()
      expect(shape.requiresGit).toBeUndefined()
      expect(typeof adapter.buildPackage).toBe('function')
    }
  })
})

describe('Runtime container layout', () => {
  it('keeps OpenClaw on its gateway health port and state path', () => {
    const adapter = getRuntime('openclaw')
    expect(adapter.runtimeKind).toBe('openclaw')
    expect(adapter.defaultImage).toBe(
      `ghcr.io/buggyblues/openclaw-runner:${DEFAULT_RUNNER_IMAGE_TAG}`,
    )
    expect(adapter.container.healthPort).toBe(3102)
    expect(adapter.container.statePath).toBe('/home/shadow/.openclaw')
    expect(adapter.container.logPath).toBe('/var/log/openclaw')
    expect(adapter.container.env).toEqual(
      expect.arrayContaining([
        { name: 'OPENCLAW_HEALTH_PORT', value: '3102' },
        { name: 'OPENCLAW_GATEWAY_PORT', value: '3101' },
        ...EXPECTED_BROWSER_ENV,
      ]),
    )
  })

  it.each([
    ['claude-code', 'cc-connect', '/home/shadow/.cc-connect'],
    ['codex', 'cc-connect', '/home/shadow/.cc-connect'],
    ['opencode', 'cc-connect', '/home/shadow/.cc-connect'],
    ['hermes', 'hermes', '/home/shadow/.hermes'],
  ] as const)('defines native container layout for %s', (id, kind, statePath) => {
    const adapter = getRuntime(id)
    expect(adapter.runtimeKind).toBe(kind)
    expect(adapter.container.healthPort).toBe(3100)
    expect(adapter.container.statePath).toBe(statePath)
    expect(adapter.container.logPath).toBe('/var/log/shadowob')
    expect(adapter.container.env).toEqual(
      expect.arrayContaining([
        { name: 'SHADOW_RUNNER_HEALTH_PORT', value: '3100' },
        { name: 'SHADOW_RUNNER_CONFIG_MOUNT', value: '/etc/openclaw' },
        { name: 'SHADOW_RUNNER_LOG_DIR', value: '/var/log/shadowob' },
        ...EXPECTED_BROWSER_ENV,
      ]),
    )
  })
})

describe('Runner Dockerfile layout', () => {
  it.each(
    RUNNER_DOCKERFILES,
  )('%s runtime stage keeps /workspace writable for materialized runtime files', (runnerDir) => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), `images/${runnerDir}/Dockerfile`),
      'utf8',
    )
    const runnerStageMatch = /\nFROM [^\n]+ AS runner\n/.exec(`\n${dockerfile}`)
    const runnerStage = dockerfile.slice(Math.max((runnerStageMatch?.index ?? 0) - 1, 0))

    expect(runnerStage).toMatch(/mkdir -p[\s\S]*\/workspace/)
    expect(runnerStage).toMatch(/chown -R [^\n]*[\s\S]*\/workspace/)
    expect(runnerStage).toMatch(/USER shadow/)
    expect(runnerStage).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]')
  })

  it.each(
    RUNNER_DOCKERFILES,
  )('%s exposes a local Chromium runtime for browser-capable plugins', (runnerDir) => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), `images/${runnerDir}/Dockerfile`),
      'utf8',
    )

    expect(dockerfile).toContain('/ms-playwright')
    expect(dockerfile).toContain('ENV CHROME_BIN=/usr/bin/chromium')
    expect(dockerfile).toContain('ENV CHROMIUM_PATH=/usr/bin/chromium')
    expect(dockerfile).toContain('ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium')
  })

  it.each([
    'claude-runner',
    'codex-runner',
    'opencode-runner',
    'hermes-runner',
  ])('%s installs the shared browser runtime at image build time', (runnerDir) => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), `images/${runnerDir}/Dockerfile`),
      'utf8',
    )
    const installScript = readFileSync(
      resolve(process.cwd(), 'images/install-browser-runtime.sh'),
      'utf8',
    )

    expect(dockerfile).toContain('COPY apps/cloud/images/install-browser-runtime.sh')
    expect(dockerfile).toContain('install-browser-runtime')
    expect(installScript).toContain('playwright@${PLAYWRIGHT_VERSION}')
    expect(installScript).toContain('install --no-shell chromium')
    expect(installScript).toContain('ln -sf "$chromium_path" /usr/bin/chromium')
  })

  it('prepares the Hermes ShadowOB connector during image build, not container startup', () => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), 'images/hermes-runner/Dockerfile'),
      'utf8',
    )
    const entrypoint = readFileSync(
      resolve(process.cwd(), 'images/hermes-runner/entrypoint.mjs'),
      'utf8',
    )

    expect(dockerfile).toContain(
      'COPY --chown=1000:1000 packages/connector/hermes-shadowob-plugin /opt/shadowob/hermes-shadowob-plugin',
    )
    expect(dockerfile).toMatch(/RUN shadowob-connector connect[\s\S]*--target hermes/)
    expect(dockerfile).toContain('--hermes-home /home/shadow/.hermes')
    expect(dockerfile).toContain('/tmp/shadow-pkgs/shadowob-connector-*.tgz')
    expect(dockerfile).not.toContain('@shadowob/connector@latest')
    expect(dockerfile).not.toContain('SHADOWOB_HERMES_PLUGIN_DIR')
    expect(dockerfile).toContain('apt-get install -y --no-install-recommends')
    expect(dockerfile).toContain('python3-pip')
    expect(dockerfile).toContain('python3-venv')
    expect(dockerfile).toContain('ffmpeg')
    expect(dockerfile).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]')
    expect(entrypoint).toContain('seedBundledShadowobPlugin')
    expect(entrypoint).toContain('/opt/shadowob/hermes-shadowob-plugin')
    expect(entrypoint).not.toContain('runConnectorSetup')
    expect(entrypoint).not.toContain('SHADOWOB_HERMES_PLUGIN_DIR')
    expect(entrypoint).not.toContain('shadowob-connector connect')
  })

  it.each([
    'claude-runner',
    'codex-runner',
    'opencode-runner',
  ])('%s installs Shadow packages from local workspace tarballs', (runnerDir) => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), `images/${runnerDir}/Dockerfile`),
      'utf8',
    )

    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS shadow-packages')
    expect(dockerfile).toContain('FROM golang:1.25-alpine AS cc-builder')
    expect(dockerfile).toContain('apk add --no-cache ca-certificates git')
    expect(dockerfile).toContain('id=go-build')
    expect(dockerfile).toContain('id=go-mod')
    expect(dockerfile).not.toContain('FROM golang:1.25-bookworm AS cc-builder')
    expect(dockerfile).toContain('pnpm --filter @shadowob/connector build')
    expect(dockerfile).toContain('/tmp/shadow-pkgs/shadowob-cli-*.tgz')
    expect(dockerfile).toContain('/tmp/shadow-pkgs/shadowob-connector-*.tgz')
    expect(dockerfile).not.toContain('@shadowob/cli@latest')
    expect(dockerfile).not.toContain('@shadowob/connector@latest')
  })

  it.each([
    'claude-runner',
    'codex-runner',
    'opencode-runner',
  ])('%s builds cc-connect from the thread-coordination adapter commit', (runnerDir) => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), `images/${runnerDir}/Dockerfile`),
      'utf8',
    )

    expect(dockerfile).toContain(`ARG CC_CONNECT_REF=${CC_CONNECT_THREAD_COORDINATION_REF}`)
  })

  it('installs OpenClaw Shadow connector from the local workspace tarball', () => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), 'images/openclaw-runner/Dockerfile'),
      'utf8',
    )
    const entrypoint = readFileSync(
      resolve(process.cwd(), 'images/openclaw-runner/entrypoint.mjs'),
      'utf8',
    )

    expect(dockerfile).toContain('pnpm --filter @shadowob/connector build')
    expect(dockerfile).toContain('/workspace/shadow-pkgs/shadowob-connector-*.tgz')
    expect(dockerfile).toContain('/opt/openclaw/bootstrap-workspace')
    expect(dockerfile).toContain('openclaw setup --workspace /opt/openclaw/bootstrap-workspace')
    expect(dockerfile).toContain('install --no-shell chromium')
    expect(dockerfile).not.toContain('--with-deps')
    expect(dockerfile).toContain('/ms-playwright')
    expect(dockerfile).not.toContain('warm-runtime-deps')
    expect(dockerfile).not.toContain('OPENCLAW_PLUGIN_STAGE_DIR')
    expect(entrypoint).toContain('seedWorkspaceFromBootstrap')
    expect(entrypoint).toContain('/opt/openclaw/bootstrap-workspace')
    expect(entrypoint).not.toContain('warmBundledPluginRuntimeDeps')
    expect(entrypoint).not.toContain('OPENCLAW_PLUGIN_STAGE_DIR')
    expect(entrypoint).not.toContain("spawnSync('openclaw'")
    expect(dockerfile).not.toContain('chromium-driver')
    expect(dockerfile).not.toContain('fonts-noto-cjk')
    expect(dockerfile).not.toContain('@shadowob/connector@latest')
  })

  it('smokes and optionally kind-loads each local runner image immediately after build', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/build-images.mjs'), 'utf8')
    const smokeScript = readFileSync(
      resolve(process.cwd(), 'scripts/smoke-test-images.mjs'),
      'utf8',
    )

    expect(script).toContain('--kind-load')
    expect(script).toContain('function runSmokeTest(name, opts)')
    expect(script).toContain("smoke-test-images.mjs')} ${name} --tag ${opts.tag}")
    expect(script).toContain('function loadKindImage(image, opts)')
    expect(script).toContain('kind load docker-image')
    expect(script).toContain('runSmokeTest(name, opts)')
    expect(script).toContain('loadKindImage(fullTag, opts)')
    expect(script).not.toContain("smoke-test-images.mjs')} ${opts.images.join(' ')}")
    expect(smokeScript).toContain('function testBrowserRuntime(image)')
    expect(smokeScript).toContain('/usr/bin/chromium --headless --no-sandbox')
  })
})
