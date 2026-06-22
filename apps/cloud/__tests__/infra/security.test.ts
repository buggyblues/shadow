import { describe, expect, it } from 'vitest'
import {
  buildContainerSecurityContext,
  buildNetworkPolicy,
  buildSecurityContext,
  buildStateVolumeInitContainerSecurityContext,
} from '../../src/infra/security'
import { RUNNER_GID, RUNNER_UID } from '../../src/runtimes/container'

describe('buildSecurityContext', () => {
  it('returns non-root pod security context', () => {
    const ctx = buildSecurityContext()
    expect(ctx.runAsNonRoot).toBe(true)
    expect(ctx.runAsUser).toBe(RUNNER_UID)
    expect(ctx.fsGroup).toBe(RUNNER_GID)
  })
})

describe('buildContainerSecurityContext', () => {
  it('drops ALL capabilities while keeping OpenClaw runtime files writable', () => {
    const ctx = buildContainerSecurityContext()
    expect(ctx.capabilities?.drop).toContain('ALL')
    expect(ctx.allowPrivilegeEscalation).toBe(false)
    expect(ctx.readOnlyRootFilesystem).toBe(false)
  })
})

describe('buildStateVolumeInitContainerSecurityContext', () => {
  it('uses root only to repair mounted state volume permissions with no capabilities', () => {
    const ctx = buildStateVolumeInitContainerSecurityContext()
    expect(ctx.runAsNonRoot).toBe(false)
    expect(ctx.runAsUser).toBe(0)
    expect(ctx.runAsGroup).toBe(RUNNER_GID)
    expect(ctx.allowPrivilegeEscalation).toBe(false)
    expect(ctx.capabilities?.drop).toContain('ALL')
  })
})

describe('buildNetworkPolicy', () => {
  it('generates deny-all + egress whitelist', () => {
    const np = buildNetworkPolicy('test-agent', 'test-ns')
    expect(np.kind).toBe('NetworkPolicy')
    expect(np.metadata.name).toBe('test-agent-netpol')
    expect(np.metadata.namespace).toBe('test-ns')
    expect(np.spec.policyTypes).toContain('Ingress')
    expect(np.spec.policyTypes).toContain('Egress')
  })

  it('allows egress to port 443 and 53', () => {
    const np = buildNetworkPolicy('test-agent', 'test-ns')
    const allEgressPorts = np.spec.egress.flatMap((r: { ports: Array<{ port: number }> }) =>
      r.ports.map((p) => p.port),
    )
    expect(allEgressPorts).toContain(443)
    expect(allEgressPorts).toContain(53)
  })

  it('allows ingress on health port', () => {
    const np = buildNetworkPolicy('test-agent', 'test-ns', 4000)
    const ingressPorts = np.spec.ingress[0].ports.map((p: { port: number }) => p.port)
    expect(ingressPorts).toContain(4000)
  })

  it('includes extra egress ports for Shadow server', () => {
    const np = buildNetworkPolicy('test-agent', 'test-ns', 3100, [3002])
    const allEgressPorts = np.spec.egress.flatMap((r: { ports: Array<{ port: number }> }) =>
      r.ports.map((p) => p.port),
    )
    expect(allEgressPorts).toContain(443)
    expect(allEgressPorts).toContain(53)
    expect(allEgressPorts).toContain(3002)
  })

  it('does not duplicate port 443 in extra egress', () => {
    const np = buildNetworkPolicy('test-agent', 'test-ns', 3100, [443])
    const allEgressPorts = np.spec.egress.flatMap((r: { ports: Array<{ port: number }> }) =>
      r.ports.map((p) => p.port),
    )
    expect(allEgressPorts.filter((p: number) => p === 443)).toHaveLength(1)
  })
})
