import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const packageRoot = process.env.OPENCLAW_PACKAGE_ROOT || '/app/node_modules/openclaw'
const configPath = process.argv[2] || process.env.OPENCLAW_CONFIG_PATH || ''

function loadConfig() {
  if (configPath && existsSync(configPath)) {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  }

  return {
    plugins: {
      enabled: true,
      load: { paths: ['/app/extensions/shadowob'] },
      entries: {
        'openclaw-shadowob': { enabled: true },
        bonjour: { enabled: false },
      },
    },
    channels: {
      shadowob: { enabled: true },
    },
  }
}

function findRuntimeDepsChunk() {
  const distDir = join(packageRoot, 'dist')
  const chunk = readdirSync(distDir).find(
    (name) => name.startsWith('bundled-runtime-deps-') && name.endsWith('.js'),
  )
  if (!chunk) {
    throw new Error(`OpenClaw bundled runtime deps chunk not found in ${distDir}`)
  }
  return join(distDir, chunk)
}

async function main() {
  const stageDir = process.env.OPENCLAW_PLUGIN_STAGE_DIR
  if (stageDir) {
    mkdirSync(stageDir, { recursive: true })
  }

  const runtimeDeps = await import(pathToFileURL(findRuntimeDepsChunk()).href)
  const config = loadConfig()
  const scan = runtimeDeps.c({
    packageRoot,
    config,
    includeConfiguredChannels: true,
    env: process.env,
  })

  if (scan.conflicts.length > 0) {
    console.warn(
      `[runtime-deps] ${scan.conflicts.length} bundled dependency conflict(s) detected`,
    )
  }

  if (scan.missing.length === 0) {
    console.log(`[runtime-deps] bundled runtime deps already staged (${scan.deps.length} specs)`)
    return
  }

  const missingSpecs = scan.missing.map((dep) => `${dep.name}@${dep.version}`)
  const installSpecs = scan.deps.map((dep) => `${dep.name}@${dep.version}`)
  const installRoot = runtimeDeps.o(packageRoot, { env: process.env })

  console.log(
    `[runtime-deps] staging ${missingSpecs.length}/${installSpecs.length} bundled runtime deps in ${installRoot}`,
  )
  const result = runtimeDeps.i({
    installRoot,
    missingSpecs,
    installSpecs,
    env: process.env,
  })
  console.log(`[runtime-deps] staged ${result.installSpecs.length} bundled runtime deps`)
}

main().catch((err) => {
  console.error(`[runtime-deps] failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
