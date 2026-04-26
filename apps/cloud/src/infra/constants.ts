/**
 * Infrastructure constants — shared between manifest generation and Pulumi deployment.
 *
 * Centralizes magic values that were previously duplicated across
 * infra/index.ts and infra/agent-deployment.ts.
 *
 * All runners use the same user (openclaw:1000) and home directory.
 * Follows OpenClaw's standard directory layout: ~/.openclaw/openclaw.json
 */

/** Health check port — must match entrypoint.mjs and Dockerfile EXPOSE */
export const HEALTH_PORT = 3100

/** Home directory for the non-root openclaw user (UID 1000) */
export const HOME_DIR = '/home/openclaw'

/** OpenClaw state directory (standard: ~/.openclaw) */
export const OPENCLAW_DATA_PATH = `${HOME_DIR}/.openclaw`

/** Log directory path */
export const LOG_PATH = '/var/log/openclaw'

/** ConfigMap mount path — read-only source config from Pulumi */
export const CONFIG_MOUNT_PATH = '/etc/openclaw'

/** Git clone init container image */
export const GIT_INIT_IMAGE = 'alpine/git:latest'

/** Default container images per runtime */
export const DEFAULT_IMAGES: Record<string, string> = {
  openclaw: 'ghcr.io/buggyblues/openclaw-runner:latest',
  'claude-code': 'ghcr.io/shadowob/claude-runner:latest',
}

/** Default resource requests/limits for agent containers */
export const DEFAULT_RESOURCES = {
  requests: { cpu: '250m', memory: '512Mi' },
  limits: { cpu: '2000m', memory: '2Gi' },
} as const

/** Liveness probe configuration */
export const LIVENESS_PROBE = {
  httpGet: { path: '/live', port: HEALTH_PORT },
  initialDelaySeconds: 30,
  periodSeconds: 15,
  failureThreshold: 5,
} as const

/** Readiness probe configuration */
export const READINESS_PROBE = {
  httpGet: { path: '/ready', port: HEALTH_PORT },
  initialDelaySeconds: 10,
  periodSeconds: 5,
} as const

/** Startup probe configuration */
export const STARTUP_PROBE = {
  httpGet: { path: '/live', port: HEALTH_PORT },
  initialDelaySeconds: 5,
  periodSeconds: 5,
  failureThreshold: 60,
} as const

/** Standard volume mounts for every agent container */
export function baseVolumeMounts() {
  return [
    { name: 'openclaw-data', mountPath: OPENCLAW_DATA_PATH },
    { name: 'config', mountPath: CONFIG_MOUNT_PATH, readOnly: true },
    { name: 'logs', mountPath: LOG_PATH },
    { name: 'tmp', mountPath: '/tmp' },
  ]
}

/** Standard volumes for every agent pod */
export function baseVolumes(configMapName: string) {
  return [
    { name: 'openclaw-data', emptyDir: {} },
    { name: 'config', configMap: { name: configMapName } },
    { name: 'logs', emptyDir: {} },
    { name: 'tmp', emptyDir: {} },
  ]
}

/** Standard environment variables for every agent container */
export function baseEnvVars(agentName: string) {
  return [
    { name: 'AGENT_ID', value: agentName },
    { name: 'NODE_ENV', value: 'production' },
    { name: 'HOME', value: HOME_DIR },
    { name: 'OPENCLAW_GATEWAY_PORT', value: String(HEALTH_PORT) },
    { name: 'OPENCLAW_NO_RESPAWN', value: '1' },
  ]
}
