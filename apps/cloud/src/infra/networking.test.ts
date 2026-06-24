import { describe, expect, it } from 'vitest'
import { buildExposureNetworkPolicyManifest, buildExposureServiceManifest } from './networking.js'

describe('exposure networking manifests', () => {
  it('creates a dedicated Service and gateway-only NetworkPolicy per exposure', () => {
    const spec = {
      exposureId: 'exp-123',
      serviceName: 'shadow-exp-demo',
      agentName: 'demo-agent',
      namespace: 'shadow-demo',
      port: 80,
      targetPort: 4310,
      gatewaySelectorLabels: { app: 'shadow-preview-gateway', tier: 'edge' },
    }

    expect(buildExposureServiceManifest(spec)).toMatchObject({
      kind: 'Service',
      metadata: {
        name: 'shadow-exp-demo',
        labels: {
          'shadowob.cloud/exposure': 'true',
          'shadowob.cloud/exposure-id': 'exp-123',
        },
      },
      spec: {
        selector: { app: 'shadowob-cloud', agent: 'demo-agent' },
        ports: [{ name: 'exposure', port: 80, targetPort: 4310, protocol: 'TCP' }],
        type: 'ClusterIP',
      },
    })

    expect(buildExposureNetworkPolicyManifest(spec)).toMatchObject({
      kind: 'NetworkPolicy',
      metadata: {
        name: 'shadow-exp-demo-netpol',
        labels: {
          'shadowob.cloud/exposure': 'true',
          'shadowob.cloud/exposure-id': 'exp-123',
        },
      },
      spec: {
        podSelector: { matchLabels: { app: 'shadowob-cloud', agent: 'demo-agent' } },
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              { podSelector: { matchLabels: { app: 'shadow-preview-gateway', tier: 'edge' } } },
            ],
            ports: [{ protocol: 'TCP', port: 4310 }],
          },
        ],
      },
    })
  })
})
