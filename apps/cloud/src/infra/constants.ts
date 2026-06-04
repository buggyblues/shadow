/**
 * Infrastructure constants shared by Pulumi/plain manifest generation.
 *
 * Runtime-specific ports, images, state paths, log paths, env vars, and volume
 * mounts live in apps/cloud/src/runtimes/* so infra code does not encode
 * OpenClaw details for native runners.
 */

/** Stable Service port exposed by generated Kubernetes Services. */
export const HEALTH_PORT = 3100

/** Git clone init container image */
export const GIT_INIT_IMAGE = 'alpine/git:latest'

/** Pulumi annotations applied to managed resources for repeatable updates. */
export const PULUMI_MANAGED_ANNOTATIONS = {
  'pulumi.com/patchForce': 'true',
} as const

/** Services do not need endpoint readiness during creation. */
export const PULUMI_SKIP_AWAIT_ANNOTATIONS = {
  'pulumi.com/skipAwait': 'true',
} as const

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
  initialDelaySeconds: 1,
  periodSeconds: 1,
} as const

/** Startup probe configuration */
export const STARTUP_PROBE = {
  httpGet: { path: '/live', port: HEALTH_PORT },
  initialDelaySeconds: 1,
  periodSeconds: 2,
  failureThreshold: 150,
} as const

export function probesForPort(port: number) {
  return {
    livenessProbe: { ...LIVENESS_PROBE, httpGet: { ...LIVENESS_PROBE.httpGet, port } },
    readinessProbe: { ...READINESS_PROBE, httpGet: { ...READINESS_PROBE.httpGet, port } },
    startupProbe: { ...STARTUP_PROBE, httpGet: { ...STARTUP_PROBE.httpGet, port } },
  } as const
}
