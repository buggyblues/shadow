/**
 * K8s security — SecurityContext and NetworkPolicy generation.
 *
 * Every agent deployment gets:
 * - SecurityContext: runAsNonRoot, drop ALL capabilities, keep filesystem writable
 * - NetworkPolicy: default deny-all, allow egress 443 (LLM API) + 53 (DNS)
 */

import { RUNNER_GID, RUNNER_UID } from '../runtimes/container.js'
import { HEALTH_PORT, PULUMI_MANAGED_ANNOTATIONS } from './constants.js'

/**
 * Generate a Pod SecurityContext for agent containers.
 * Enforces the principle of least privilege.
 */
export function buildSecurityContext() {
  return {
    runAsNonRoot: true,
    runAsUser: RUNNER_UID,
    runAsGroup: RUNNER_GID,
    fsGroup: RUNNER_GID,
    seccompProfile: {
      type: 'RuntimeDefault',
    },
  }
}

/**
 * Generate a container SecurityContext with capability restrictions.
 */
export function buildContainerSecurityContext() {
  return {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: false,
    runAsNonRoot: true,
    runAsUser: RUNNER_UID,
    runAsGroup: RUNNER_GID,
    capabilities: {
      drop: ['ALL'],
    },
  }
}

/**
 * The state-volume permission repair container runs as root only long enough
 * to claim the mounted runtime state directory for the non-root runner.
 */
export function buildStateVolumeInitContainerSecurityContext() {
  return {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    runAsNonRoot: false,
    runAsUser: 0,
    runAsGroup: RUNNER_GID,
    capabilities: {
      drop: ['ALL'],
      add: ['CHOWN', 'FOWNER', 'DAC_READ_SEARCH'],
    },
  }
}

/**
 * Generate a NetworkPolicy manifest that restricts agent pod traffic:
 * - Deny all ingress except health check port (3100)
 * - Deny all egress except HTTPS (443), DNS (53), and optional extra ports
 */
export function buildNetworkPolicy(
  agentName: string,
  namespace: string,
  healthPort = HEALTH_PORT,
  extraEgressPorts: number[] = [],
  networking?: {
    type: 'unrestricted' | 'limited' | 'deny-all'
    allowedHosts?: string[]
    allowMcpServers?: boolean
    allowPackageManagers?: boolean
  },
  metadata?: {
    labels?: Record<string, string>
    annotations?: Record<string, string>
  },
): Record<string, unknown> {
  if (networking?.type === 'deny-all') {
    // Deny all egress except DNS
    return {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: `${agentName}-netpol`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName, ...(metadata?.labels ?? {}) },
        annotations: {
          ...PULUMI_MANAGED_ANNOTATIONS,
          ...(metadata?.annotations ?? {}),
        },
      },
      spec: {
        podSelector: {
          matchLabels: { app: 'shadowob-cloud', agent: agentName },
        },
        policyTypes: ['Ingress', 'Egress'],
        ingress: [{ ports: [{ protocol: 'TCP', port: healthPort }] }],
        egress: [
          {
            ports: [
              { protocol: 'UDP', port: 53 },
              { protocol: 'TCP', port: 53 },
            ],
          },
        ],
      },
    }
  }

  // Default / limited: HTTPS + DNS + extra ports
  const egress: Array<Record<string, unknown>> = [
    // Allow HTTPS (LLM API endpoints)
    { ports: [{ protocol: 'TCP', port: 443 }] },
    // Allow DNS resolution
    {
      ports: [
        { protocol: 'UDP', port: 53 },
        { protocol: 'TCP', port: 53 },
      ],
    },
  ]
  // Allow extra ports (e.g. Shadow server on non-standard port)
  for (const port of extraEgressPorts) {
    if (port !== 443 && port !== 53) {
      egress.push({ ports: [{ protocol: 'TCP', port }] })
    }
  }
  // P1: Allow package manager registries (HTTP port 80)
  if (networking?.allowPackageManagers) {
    egress.push({ ports: [{ protocol: 'TCP', port: 80 }] })
  }
  // P1: Allow MCP server connections (stdio-over-HTTP, typically 8080-8090)
  if (networking?.allowMcpServers) {
    egress.push({
      ports: [
        { protocol: 'TCP', port: 8080 },
        { protocol: 'TCP', port: 8081 },
        { protocol: 'TCP', port: 3000 },
      ],
    })
  }

  const policy: Record<string, unknown> = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: `${agentName}-netpol`,
      namespace,
      labels: { app: 'shadowob-cloud', agent: agentName, ...(metadata?.labels ?? {}) },
      // Record allowed hosts as annotation for documentation
      ...(networking?.allowedHosts?.length
        ? {
            annotations: {
              ...PULUMI_MANAGED_ANNOTATIONS,
              ...(metadata?.annotations ?? {}),
              'shadowob-cloud/allowed-hosts': networking.allowedHosts.join(','),
            },
          }
        : {
            annotations: {
              ...PULUMI_MANAGED_ANNOTATIONS,
              ...(metadata?.annotations ?? {}),
            },
          }),
    },
    spec: {
      podSelector: {
        matchLabels: { app: 'shadowob-cloud', agent: agentName },
      },
      policyTypes: ['Ingress', 'Egress'],
      ingress: [
        {
          ports: [{ protocol: 'TCP', port: healthPort }],
        },
      ],
      egress,
    },
  }

  return policy
}
