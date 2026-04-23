import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(() => ''),
}))

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    execFileSync: execFileSyncMock,
  }
})

import { listManagedNamespaces } from '../src/lib/k8s-cli'

const originalKubeconfig = process.env.KUBECONFIG
const originalKubeconfigHostPath = process.env.KUBECONFIG_HOST_PATH
const originalKubeconfigContext = process.env.KUBECONFIG_CONTEXT
const originalLoopbackHost = process.env.KUBECONFIG_LOOPBACK_HOST

const tempDirs: string[] = []

afterEach(() => {
  execFileSyncMock.mockClear()

  if (originalKubeconfig === undefined) {
    delete process.env.KUBECONFIG
  } else {
    process.env.KUBECONFIG = originalKubeconfig
  }

  if (originalKubeconfigHostPath === undefined) {
    delete process.env.KUBECONFIG_HOST_PATH
  } else {
    process.env.KUBECONFIG_HOST_PATH = originalKubeconfigHostPath
  }

  if (originalKubeconfigContext === undefined) {
    delete process.env.KUBECONFIG_CONTEXT
  } else {
    process.env.KUBECONFIG_CONTEXT = originalKubeconfigContext
  }

  if (originalLoopbackHost === undefined) {
    delete process.env.KUBECONFIG_LOOPBACK_HOST
  } else {
    process.env.KUBECONFIG_LOOPBACK_HOST = originalLoopbackHost
  }

  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
})

describe('k8s-cli ambient kubeconfig handling', () => {
  it('does not rewrite host-local kubeconfig endpoints when KUBECONFIG_HOST_PATH is used', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'shadow-server-kubeconfig-'))
    tempDirs.push(tempDir)

    const hostKubeconfigPath = join(tempDir, 'config.yaml')
    writeFileSync(
      hostKubeconfigPath,
      `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: rancher-desktop
contexts:
- context:
    cluster: rancher-desktop
    user: rancher-desktop
  name: rancher-desktop
current-context: rancher-desktop
users:
- name: rancher-desktop
  user:
    token: test`,
      'utf8',
    )

    process.env.KUBECONFIG = '/root/.kube/config'
    process.env.KUBECONFIG_HOST_PATH = hostKubeconfigPath
    process.env.KUBECONFIG_CONTEXT = 'rancher-desktop'
    process.env.KUBECONFIG_LOOPBACK_HOST = 'host.lima.internal'

    let capturedKubeconfig = ''
    execFileSyncMock.mockImplementation((_command, args) => {
      const kubeconfigFlagIndex = Array.isArray(args) ? args.indexOf('--kubeconfig') : -1
      const tempKubeconfigPath = Array.isArray(args) ? args[kubeconfigFlagIndex + 1] : undefined
      capturedKubeconfig = tempKubeconfigPath ? readFileSync(tempKubeconfigPath, 'utf8') : ''
      return ''
    })

    listManagedNamespaces()

    expect(execFileSyncMock).toHaveBeenCalledOnce()
    expect(capturedKubeconfig).toContain('server: https://127.0.0.1:6443')
    expect(capturedKubeconfig).not.toContain('host.lima.internal')
  })

  it('recognizes namespaces managed by either the legacy or new Shadow Cloud labels', () => {
    execFileSyncMock.mockReturnValue(
      JSON.stringify({
        items: [
          {
            metadata: {
              name: 'legacy-ns',
              labels: {
                'managed-by': 'shadowob-cloud-cli',
              },
            },
          },
          {
            metadata: {
              name: 'new-ns',
              labels: {
                'shadowob-cloud/managed': 'true',
              },
            },
          },
          {
            metadata: {
              name: 'other-ns',
              labels: {
                app: 'something-else',
              },
            },
          },
        ],
      }),
    )

    expect(listManagedNamespaces()).toEqual(['legacy-ns', 'new-ns'])
  })
})
