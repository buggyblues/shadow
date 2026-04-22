import { describe, expect, it } from 'vitest'
import { rewriteLoopbackKubeconfig } from '../../src/services/deployment-runtime.service'

describe('rewriteLoopbackKubeconfig', () => {
  it('rewrites localhost-style kubeconfig servers to the configured host alias', () => {
    const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: local
contexts:
- context:
    cluster: local
    user: local
  name: local
current-context: local`

    const rewritten = rewriteLoopbackKubeconfig(kubeconfig, 'host.lima.internal')

    expect(rewritten).toContain('server: https://host.lima.internal:6443')
    expect(rewritten).toContain('tls-server-name: localhost')
  })

  it('also rewrites localhost hostnames', () => {
    const kubeconfig = `clusters:
- cluster:
    server: https://localhost:6443
  name: local`

    expect(rewriteLoopbackKubeconfig(kubeconfig, 'host.docker.internal')).toContain(
      'server: https://host.docker.internal:6443',
    )
  })

  it('leaves kubeconfig untouched when no loopback host override is provided', () => {
    const kubeconfig = `clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: local`

    expect(rewriteLoopbackKubeconfig(kubeconfig, '')).toBe(kubeconfig)
  })
})
