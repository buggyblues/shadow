/**
 * K8s security — SecurityContext and NetworkPolicy generation.
 *
 * Every agent deployment gets:
 * - SecurityContext: runAsNonRoot, readOnlyRootFilesystem, drop ALL capabilities
 * - NetworkPolicy: default deny-all, allow egress 443 (LLM API) + 53 (DNS)
 */

import { HEALTH_PORT, PULUMI_MANAGED_ANNOTATIONS } from './constants.js'

/**
 * Generate a Pod SecurityContext for agent containers.
 * Enforces the principle of least privilege.
 */
export function buildSecurityContext() {
  return {
    runAsNonRoot: true,
    runAsUser: 1000,
    runAsGroup: 1000,
    fsGroup: 1000,
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
    readOnlyRootFilesystem: true,
    runAsNonRoot: true,
    runAsUser: 1000,
    capabilities: {
      drop: ['ALL'],
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
): Record<string, unknown> {
  // P1: Per-agent networking policy
  if (networking?.type === 'unrestricted') {
    // Unrestricted: allow all egress, only limit ingress to health port
    return {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: `${agentName}-netpol`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName },
        annotations: PULUMI_MANAGED_ANNOTATIONS,
      },
      spec: {
        podSelector: {
          matchLabels: { app: 'shadowob-cloud', agent: agentName },
        },
        policyTypes: ['Ingress'],
        ingress: [{ ports: [{ protocol: 'TCP', port: healthPort }] }],
      },
    }
  }

  if (networking?.type === 'deny-all') {
    // Deny all egress except DNS
    return {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: `${agentName}-netpol`,
        namespace,
        labels: { app: 'shadowob-cloud', agent: agentName },
        annotations: PULUMI_MANAGED_ANNOTATIONS,
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
      labels: { app: 'shadowob-cloud', agent: agentName },
      // Record allowed hosts as annotation for documentation
      ...(networking?.allowedHosts?.length
        ? {
            annotations: {
              ...PULUMI_MANAGED_ANNOTATIONS,
              'shadowob-cloud/allowed-hosts': networking.allowedHosts.join(','),
            },
          }
        : { annotations: PULUMI_MANAGED_ANNOTATIONS }),
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
