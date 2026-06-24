/**
 * Networking — Kubernetes Service via Pulumi.
 */

import * as k8s from '@pulumi/kubernetes'
import type * as pulumi from '@pulumi/pulumi'
import { PULUMI_MANAGED_ANNOTATIONS, PULUMI_SKIP_AWAIT_ANNOTATIONS } from './constants.js'
import { serviceNameForAgent } from './k8s-names.js'

export interface NetworkingOptions {
  agentName: string
  namespace: string | pulumi.Input<string>
  port: number
  targetPort?: number
  provider: k8s.Provider
  labels?: Record<string, string>
  annotations?: Record<string, string>
  resourceOptions?: pulumi.CustomResourceOptions
}

export function createNetworking(options: NetworkingOptions) {
  const { agentName, namespace, port, targetPort, provider, resourceOptions } = options
  const serviceName = serviceNameForAgent(agentName)

  const service = new k8s.core.v1.Service(
    serviceName,
    {
      metadata: {
        name: serviceName,
        namespace,
        labels: {
          app: 'shadowob-cloud',
          agent: agentName,
          ...(options.labels ?? {}),
        },
        annotations: {
          ...PULUMI_MANAGED_ANNOTATIONS,
          ...PULUMI_SKIP_AWAIT_ANNOTATIONS,
          ...(options.annotations ?? {}),
        },
      },
      spec: {
        selector: {
          app: 'shadowob-cloud',
          agent: agentName,
        },
        ports: [
          {
            name: 'health',
            port,
            targetPort: targetPort ?? port,
            protocol: 'TCP',
          },
        ],
        type: 'ClusterIP',
      },
    },
    { provider, ...resourceOptions },
  )

  return { service }
}

export interface ExposureNetworkingSpec {
  exposureId: string
  serviceName: string
  agentName: string
  namespace: string | pulumi.Input<string>
  port: number
  targetPort: number
  gatewaySelectorLabels?: Record<string, string>
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

function exposureMetadata(options: ExposureNetworkingSpec) {
  return {
    name: options.serviceName,
    namespace: options.namespace,
    labels: {
      app: 'shadowob-cloud',
      agent: options.agentName,
      'shadowob.cloud/exposure': 'true',
      'shadowob.cloud/exposure-id': options.exposureId,
      ...(options.labels ?? {}),
    },
    annotations: {
      ...PULUMI_SKIP_AWAIT_ANNOTATIONS,
      ...(options.annotations ?? {}),
    },
  }
}

export function buildExposureServiceManifest(options: ExposureNetworkingSpec) {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: exposureMetadata(options),
    spec: {
      selector: {
        app: 'shadowob-cloud',
        agent: options.agentName,
      },
      ports: [
        {
          name: 'exposure',
          port: options.port,
          targetPort: options.targetPort,
          protocol: 'TCP',
        },
      ],
      type: 'ClusterIP',
    },
  }
}

export function buildExposureNetworkPolicyManifest(options: ExposureNetworkingSpec) {
  const gatewaySelector = options.gatewaySelectorLabels ?? {
    app: 'shadow-preview-gateway',
  }
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: `${options.serviceName}-netpol`,
      namespace: options.namespace,
      labels: {
        app: 'shadowob-cloud',
        agent: options.agentName,
        'shadowob.cloud/exposure': 'true',
        'shadowob.cloud/exposure-id': options.exposureId,
        ...(options.labels ?? {}),
      },
      annotations: options.annotations ?? {},
    },
    spec: {
      podSelector: {
        matchLabels: {
          app: 'shadowob-cloud',
          agent: options.agentName,
        },
      },
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: [{ podSelector: { matchLabels: gatewaySelector } }],
          ports: [{ protocol: 'TCP', port: options.targetPort }],
        },
      ],
    },
  }
}

export function createExposureNetworking(
  options: ExposureNetworkingSpec & {
    provider: k8s.Provider
    resourceOptions?: pulumi.CustomResourceOptions
  },
) {
  const {
    apiVersion: _serviceApiVersion,
    kind: _serviceKind,
    ...serviceArgs
  } = buildExposureServiceManifest(options)
  const {
    apiVersion: _policyApiVersion,
    kind: _policyKind,
    ...networkPolicyArgs
  } = buildExposureNetworkPolicyManifest(options)
  const service = new k8s.core.v1.Service(options.serviceName, serviceArgs, {
    provider: options.provider,
    ...options.resourceOptions,
  })
  const networkPolicy = new k8s.networking.v1.NetworkPolicy(
    `${options.serviceName}-netpol`,
    networkPolicyArgs,
    { provider: options.provider, ...options.resourceOptions },
  )
  return { service, networkPolicy }
}
