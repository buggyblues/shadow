import type { RuntimeContainerSpec } from './index.js'

export const RUNNER_HOME_DIR = '/home/shadow'
export const RUNNER_CONFIG_MOUNT_PATH = '/etc/openclaw'
export const SHADOWOB_CONFIG_MOUNT_PATH = '/etc/shadowob'
export const RUNNER_STATE_VOLUME_NAME = 'shadow-runner-state'
export const RUNNER_LOG_VOLUME_NAME = 'shadow-runner-logs'
export const RUNNER_CONFIG_VOLUME_NAME = 'shadow-runner-config'
export const RUNNER_TMP_VOLUME_NAME = 'shadow-runner-tmp'
export const RUNNER_AGENTS_VOLUME_NAME = 'shadow-runner-agents'
export const RUNNER_UID = 1000
export const RUNNER_GID = 1000
export const RUNNER_STATE_MODE = '2770'

export const NATIVE_RUNNER_HEALTH_PORT = 3100
export const OPENCLAW_GATEWAY_PORT = 3101
export const OPENCLAW_HEALTH_PORT = 3102

export const OPENCLAW_STATE_PATH = `${RUNNER_HOME_DIR}/.openclaw`
export const CC_CONNECT_STATE_PATH = `${RUNNER_HOME_DIR}/.cc-connect`
export const HERMES_STATE_PATH = `${RUNNER_HOME_DIR}/.hermes`
export const HERMES_STATE_MODE = RUNNER_STATE_MODE
export const RUNNER_HOME_LOCAL_PATH = `${RUNNER_HOME_DIR}/.local`
export const RUNNER_HOME_CACHE_PATH = `${RUNNER_HOME_DIR}/.cache`
export const RUNNER_SHADOW_TOOLS_PATH = `${RUNNER_HOME_DIR}/.shadow-tools`
export const RUNNER_HOME_CONFIG_PATH = `${RUNNER_HOME_DIR}/.config`
export const RUNNER_HOME_DATA_PATH = `${RUNNER_HOME_LOCAL_PATH}/share`
export const RUNNER_HOME_STATE_PATH = `${RUNNER_HOME_LOCAL_PATH}/state`
export const RUNNER_DEFAULT_PATH = [
  `${RUNNER_HOME_LOCAL_PATH}/bin`,
  '/usr/local/sbin',
  '/usr/local/bin',
  '/usr/sbin',
  '/usr/bin',
  '/sbin',
  '/bin',
].join(':')
export const OPENCLAW_LOG_PATH = '/var/log/openclaw'
export const SHADOWOB_RUNNER_LOG_PATH = '/var/log/shadowob'

export interface RunnerPersistentDirectory {
  id: string
  path: string
  stateSubPath: string
  description: string
}

export const RUNNER_PERSISTENT_HOME_MOUNT = {
  id: 'home',
  mountPath: RUNNER_HOME_DIR,
  description: 'Durable runner home. Tool installs, dotfiles, auth state, and runtime state live here.',
} as const

export const RUNNER_PERSISTENT_DIRECTORIES: RunnerPersistentDirectory[] = [
  {
    id: 'home-local',
    path: RUNNER_HOME_LOCAL_PATH,
    stateSubPath: '.local',
    description: 'User-installed executables and libraries, including npm global prefix and pip userbase.',
  },
  {
    id: 'home-cache',
    path: RUNNER_HOME_CACHE_PATH,
    stateSubPath: '.cache',
    description: 'Package manager caches that should survive container restarts.',
  },
  {
    id: 'home-config',
    path: RUNNER_HOME_CONFIG_PATH,
    stateSubPath: '.config',
    description: 'XDG config home for tools that follow the XDG base directory spec.',
  },
  {
    id: 'home-data',
    path: RUNNER_HOME_DATA_PATH,
    stateSubPath: '.local/share',
    description: 'XDG data home for tools that follow the XDG base directory spec.',
  },
  {
    id: 'home-state',
    path: RUNNER_HOME_STATE_PATH,
    stateSubPath: '.local/state',
    description: 'XDG state home for tools that follow the XDG base directory spec.',
  },
  {
    id: 'shadow-tools',
    path: RUNNER_SHADOW_TOOLS_PATH,
    stateSubPath: '.shadow-tools',
    description: 'Shadow-managed user-space tool roots such as persistent apt extraction.',
  },
]

export const RUNNER_EPHEMERAL_PATHS = ['/tmp', '/workspace/.agents'] as const

export function runnerPersistentStateSubPaths(): string[] {
  return [...new Set(RUNNER_PERSISTENT_DIRECTORIES.map((directory) => directory.stateSubPath))]
}

function runnerPersistentDirs(statePath: string): string {
  return [RUNNER_HOME_DIR, statePath, ...RUNNER_PERSISTENT_DIRECTORIES.map((dir) => dir.path)].join(
    ':',
  )
}

function runnerEphemeralDirs(logPath: string): string {
  return [...RUNNER_EPHEMERAL_PATHS, logPath].join(':')
}

const BROWSER_RUNTIME_ENV = [
  { name: 'PLAYWRIGHT_BROWSERS_PATH', value: '/ms-playwright' },
  { name: 'CHROME_BIN', value: '/usr/bin/chromium-headless-shell' },
  { name: 'CHROMIUM_PATH', value: '/usr/bin/chromium-headless-shell' },
  { name: 'PUPPETEER_EXECUTABLE_PATH', value: '/usr/bin/chromium-headless-shell' },
  {
    name: 'CHROME_FLAGS',
    value:
      '--no-sandbox --disable-gpu --disable-software-rasterizer --single-process --disable-dev-shm-usage',
  },
  {
    name: 'CHROMIUM_FLAGS',
    value:
      '--no-sandbox --disable-gpu --disable-software-rasterizer --single-process --disable-dev-shm-usage',
  },
  {
    name: 'PUPPETEER_ARGS',
    value:
      '["--no-sandbox","--disable-gpu","--disable-software-rasterizer","--single-process","--disable-dev-shm-usage"]',
  },
]

function persistentToolEnv(
  statePath: string,
  logPath: string,
): ReadonlyArray<{ name: string; value: string }> {
  return [
    { name: 'PATH', value: RUNNER_DEFAULT_PATH },
    { name: 'NPM_CONFIG_PREFIX', value: RUNNER_HOME_LOCAL_PATH },
    { name: 'npm_config_prefix', value: RUNNER_HOME_LOCAL_PATH },
    { name: 'NPM_CONFIG_CACHE', value: `${RUNNER_HOME_CACHE_PATH}/npm` },
    { name: 'npm_config_cache', value: `${RUNNER_HOME_CACHE_PATH}/npm` },
    { name: 'PIP_CACHE_DIR', value: `${RUNNER_HOME_CACHE_PATH}/pip` },
    { name: 'PIP_BREAK_SYSTEM_PACKAGES', value: '1' },
    { name: 'PYTHONUSERBASE', value: RUNNER_HOME_LOCAL_PATH },
    { name: 'XDG_CONFIG_HOME', value: RUNNER_HOME_CONFIG_PATH },
    { name: 'XDG_CACHE_HOME', value: RUNNER_HOME_CACHE_PATH },
    { name: 'XDG_DATA_HOME', value: RUNNER_HOME_DATA_PATH },
    { name: 'XDG_STATE_HOME', value: RUNNER_HOME_STATE_PATH },
    { name: 'SHADOWOB_PERSISTENT_TOOLS_DIR', value: RUNNER_SHADOW_TOOLS_PATH },
    { name: 'SHADOWOB_PERSISTENT_APT_ROOT', value: `${RUNNER_SHADOW_TOOLS_PATH}/apt` },
    { name: 'SHADOWOB_RUNNER_PERSISTENT_DIRS', value: runnerPersistentDirs(statePath) },
    { name: 'SHADOWOB_RUNNER_EPHEMERAL_DIRS', value: runnerEphemeralDirs(logPath) },
    { name: 'SHADOWOB_RUNNER_TEMP_DIR', value: '/tmp' },
  ] as const
}

export function runtimeStatePvcName(agentName: string): string {
  return `${RUNNER_STATE_VOLUME_NAME}-${agentName}`
}

export function openclawContainerSpec(): RuntimeContainerSpec {
  return {
    homeDir: RUNNER_HOME_DIR,
    healthPort: OPENCLAW_HEALTH_PORT,
    statePath: OPENCLAW_STATE_PATH,
    logPath: OPENCLAW_LOG_PATH,
    env: [
      { name: 'OPENCLAW_NO_RESPAWN', value: '1' },
      { name: 'OPENCLAW_STATE_DIR', value: OPENCLAW_STATE_PATH },
      { name: 'OPENCLAW_DATA_DIR', value: OPENCLAW_STATE_PATH },
      { name: 'OPENCLAW_HEALTH_PORT', value: String(OPENCLAW_HEALTH_PORT) },
      { name: 'OPENCLAW_GATEWAY_PORT', value: String(OPENCLAW_GATEWAY_PORT) },
      { name: 'OPENCLAW_SKIP_STARTUP_MODEL_PREWARM', value: '1' },
      ...persistentToolEnv(OPENCLAW_STATE_PATH, OPENCLAW_LOG_PATH),
      ...BROWSER_RUNTIME_ENV,
    ],
  }
}

export function ccConnectContainerSpec(): RuntimeContainerSpec {
  return {
    homeDir: RUNNER_HOME_DIR,
    healthPort: NATIVE_RUNNER_HEALTH_PORT,
    statePath: CC_CONNECT_STATE_PATH,
    logPath: SHADOWOB_RUNNER_LOG_PATH,
    env: [
      { name: 'OPENCLAW_NO_RESPAWN', value: '1' },
      { name: 'SHADOWOB_RUNNER_HEALTH_PORT', value: String(NATIVE_RUNNER_HEALTH_PORT) },
      { name: 'SHADOWOB_RUNNER_CONFIG_MOUNT', value: RUNNER_CONFIG_MOUNT_PATH },
      { name: 'SHADOWOB_RUNNER_STATE_DIR', value: CC_CONNECT_STATE_PATH },
      { name: 'SHADOWOB_RUNNER_LOG_DIR', value: SHADOWOB_RUNNER_LOG_PATH },
      ...persistentToolEnv(CC_CONNECT_STATE_PATH, SHADOWOB_RUNNER_LOG_PATH),
      ...BROWSER_RUNTIME_ENV,
    ],
  }
}

export function hermesContainerSpec(): RuntimeContainerSpec {
  return {
    homeDir: RUNNER_HOME_DIR,
    healthPort: NATIVE_RUNNER_HEALTH_PORT,
    statePath: HERMES_STATE_PATH,
    logPath: SHADOWOB_RUNNER_LOG_PATH,
    env: [
      { name: 'OPENCLAW_NO_RESPAWN', value: '1' },
      { name: 'SHADOWOB_RUNNER_HEALTH_PORT', value: String(NATIVE_RUNNER_HEALTH_PORT) },
      { name: 'SHADOWOB_RUNNER_CONFIG_MOUNT', value: RUNNER_CONFIG_MOUNT_PATH },
      { name: 'SHADOWOB_RUNNER_STATE_DIR', value: HERMES_STATE_PATH },
      { name: 'SHADOWOB_RUNNER_LOG_DIR', value: SHADOWOB_RUNNER_LOG_PATH },
      { name: 'HERMES_HOME', value: HERMES_STATE_PATH },
      { name: 'HERMES_HOME_MODE', value: HERMES_STATE_MODE },
      ...persistentToolEnv(HERMES_STATE_PATH, SHADOWOB_RUNNER_LOG_PATH),
      ...BROWSER_RUNTIME_ENV,
    ],
  }
}
