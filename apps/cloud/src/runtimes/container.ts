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
export const OPENCLAW_LOG_PATH = '/var/log/openclaw'
export const SHADOW_RUNNER_LOG_PATH = '/var/log/shadowob'

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
      ...BROWSER_RUNTIME_ENV,
    ],
  }
}

export function ccConnectContainerSpec(): RuntimeContainerSpec {
  return {
    homeDir: RUNNER_HOME_DIR,
    healthPort: NATIVE_RUNNER_HEALTH_PORT,
    statePath: CC_CONNECT_STATE_PATH,
    logPath: SHADOW_RUNNER_LOG_PATH,
    env: [
      { name: 'OPENCLAW_NO_RESPAWN', value: '1' },
      { name: 'SHADOW_RUNNER_HEALTH_PORT', value: String(NATIVE_RUNNER_HEALTH_PORT) },
      { name: 'SHADOW_RUNNER_CONFIG_MOUNT', value: RUNNER_CONFIG_MOUNT_PATH },
      { name: 'SHADOW_RUNNER_STATE_DIR', value: CC_CONNECT_STATE_PATH },
      { name: 'SHADOW_RUNNER_LOG_DIR', value: SHADOW_RUNNER_LOG_PATH },
      ...BROWSER_RUNTIME_ENV,
    ],
  }
}

export function hermesContainerSpec(): RuntimeContainerSpec {
  return {
    homeDir: RUNNER_HOME_DIR,
    healthPort: NATIVE_RUNNER_HEALTH_PORT,
    statePath: HERMES_STATE_PATH,
    logPath: SHADOW_RUNNER_LOG_PATH,
    env: [
      { name: 'OPENCLAW_NO_RESPAWN', value: '1' },
      { name: 'SHADOW_RUNNER_HEALTH_PORT', value: String(NATIVE_RUNNER_HEALTH_PORT) },
      { name: 'SHADOW_RUNNER_CONFIG_MOUNT', value: RUNNER_CONFIG_MOUNT_PATH },
      { name: 'SHADOW_RUNNER_STATE_DIR', value: HERMES_STATE_PATH },
      { name: 'SHADOW_RUNNER_LOG_DIR', value: SHADOW_RUNNER_LOG_PATH },
      { name: 'HERMES_HOME_MODE', value: HERMES_STATE_MODE },
      ...BROWSER_RUNTIME_ENV,
    ],
  }
}
