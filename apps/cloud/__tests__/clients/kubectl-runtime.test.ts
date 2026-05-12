import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const execFileSyncMock = vi.fn(() => '')
const execSyncMock = vi.fn(() => '')
const spawnMock = vi.fn()

vi.mock('node:child_process', async () => {
  return {
    execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
    execSync: (...args: unknown[]) => execSyncMock(...args),
    spawn: (...args: unknown[]) => spawnMock(...args),
    spawnSync: vi.fn(),
  }
})

import { getAgentSandboxDeployments } from '../../src/clients/kubectl-client'
import {
  getPvcVolumeSnapshotCapability,
  isPvcBackedByCsiProvisioner,
  isVolumeSnapshotApiAvailable,
  listManagedNamespaces,
  resolveSandboxNameAsync,
  resolveVolumeSnapshotClassForPvc,
} from '../../src/clients/kubectl-runtime'

const originalKubeconfig = process.env.KUBECONFIG
const originalKubeconfigHostPath = process.env.KUBECONFIG_HOST_PATH
const originalKubeconfigContext = process.env.KUBECONFIG_CONTEXT
const originalLoopbackHost = process.env.KUBECONFIG_LOOPBACK_HOST
const originalHome = process.env.HOME
const originalContainerized = process.env.SHADOW_CONTAINERIZED

const tempDirs: string[] = []

afterEach(() => {
  execFileSyncMock.mockClear()
  execSyncMock.mockClear()
  spawnMock.mockClear()

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

  if (originalHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = originalHome
  }

  if (originalContainerized === undefined) {
    delete process.env.SHADOW_CONTAINERIZED
  } else {
    process.env.SHADOW_CONTAINERIZED = originalContainerized
  }

  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
})

function mockAsyncKubectl(stdout: string, exitCode = 0) {
  spawnMock.mockImplementationOnce(() => {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: ReturnType<typeof vi.fn>
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn()
    queueMicrotask(() => {
      if (stdout) proc.stdout.emit('data', Buffer.from(stdout))
      proc.emit('close', exitCode)
    })
    return proc
  })
}

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

  it('rewrites mounted home kubeconfig endpoints when running in a containerized runtime', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'shadow-server-container-home-'))
    tempDirs.push(tempHome)

    const kubeDir = join(tempHome, '.kube')
    mkdirSync(kubeDir, { recursive: true })
    const mountedKubeconfigPath = join(kubeDir, 'config')
    writeFileSync(
      mountedKubeconfigPath,
      `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: mounted-cluster
contexts:
- context:
    cluster: mounted-cluster
    user: mounted-user
  name: mounted-cluster
current-context: mounted-cluster
users:
- name: mounted-user
  user:
    token: mounted-token`,
      'utf8',
    )

    process.env.HOME = tempHome
    process.env.KUBECONFIG = mountedKubeconfigPath
    delete process.env.KUBECONFIG_HOST_PATH
    process.env.KUBECONFIG_CONTEXT = 'mounted-cluster'
    process.env.KUBECONFIG_LOOPBACK_HOST = 'host.lima.internal'
    process.env.SHADOW_CONTAINERIZED = '1'

    let capturedKubeconfig = ''
    execFileSyncMock.mockImplementation((_command, args) => {
      const kubeconfigFlagIndex = Array.isArray(args) ? args.indexOf('--kubeconfig') : -1
      const tempKubeconfigPath = Array.isArray(args) ? args[kubeconfigFlagIndex + 1] : undefined
      capturedKubeconfig = tempKubeconfigPath ? readFileSync(tempKubeconfigPath, 'utf8') : ''
      return JSON.stringify({ items: [] })
    })

    expect(listManagedNamespaces()).toEqual([])
    expect(execFileSyncMock).toHaveBeenCalledOnce()
    expect(capturedKubeconfig).toContain('server: https://host.lima.internal:6443')
    expect(capturedKubeconfig).toContain('tls-server-name: localhost')
  })

  it('does not override a mounted kubeconfig current-context with stale env context', () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'shadow-server-container-context-'))
    tempDirs.push(tempHome)

    const kubeDir = join(tempHome, '.kube')
    mkdirSync(kubeDir, { recursive: true })
    const mountedKubeconfigPath = join(kubeDir, 'config')
    writeFileSync(
      mountedKubeconfigPath,
      `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: kind-agent-sandbox
contexts:
- context:
    cluster: kind-agent-sandbox
    user: kind-agent-sandbox
  name: kind-agent-sandbox
current-context: kind-agent-sandbox
users:
- name: kind-agent-sandbox
  user:
    token: mounted-token`,
      'utf8',
    )

    process.env.HOME = tempHome
    process.env.KUBECONFIG = mountedKubeconfigPath
    delete process.env.KUBECONFIG_HOST_PATH
    process.env.KUBECONFIG_CONTEXT = 'rancher-desktop'
    process.env.KUBECONFIG_LOOPBACK_HOST = 'host.lima.internal'
    process.env.SHADOW_CONTAINERIZED = '1'

    execFileSyncMock.mockReturnValue(JSON.stringify({ items: [] }))

    expect(listManagedNamespaces()).toEqual([])

    const args = execFileSyncMock.mock.calls[0]?.[1]
    expect(args).toEqual(expect.arrayContaining(['--kubeconfig']))
    expect(args).not.toEqual(expect.arrayContaining(['--context', 'rancher-desktop']))
  })

  it('resolves SandboxClaim status.sandbox object references from real agent-sandbox CRDs', async () => {
    mockAsyncKubectl(
      JSON.stringify({
        status: {
          sandbox: {
            name: 'shadow-cloud-smoke-agent',
            podIPs: ['10.244.0.10'],
          },
        },
      }),
    )

    await expect(resolveSandboxNameAsync('shadow-cloud-smoke', 'agent')).resolves.toBe(
      'shadow-cloud-smoke-agent',
    )
  })

  it('lists SandboxClaim status.sandbox object references as string sandbox names', () => {
    execSyncMock
      .mockReturnValueOnce(
        JSON.stringify({
          items: [
            {
              metadata: {
                name: 'shadow-cloud-cli-agent',
                annotations: {
                  'shadowob.cloud/state-pvc': 'openclaw-data-shadow-cloud-cli-agent',
                },
              },
              status: {
                sandbox: {
                  name: 'shadow-cloud-cli-agent',
                  podIPs: ['10.244.0.17'],
                },
              },
            },
          ],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          items: [
            {
              metadata: { name: 'shadow-cloud-cli-agent' },
              spec: { replicas: 1 },
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
              },
            },
          ],
        }),
      )

    expect(getAgentSandboxDeployments('shadow-cloud-cli-smoke')).toMatchObject([
      {
        name: 'shadow-cloud-cli-agent',
        workloadKind: 'agent-sandbox',
        runtimeState: 'running',
        sandboxName: 'shadow-cloud-cli-agent',
        serviceFQDN: 'shadow-cloud-cli-agent.shadow-cloud-cli-smoke.svc.cluster.local',
        statePvc: 'openclaw-data-shadow-cloud-cli-agent',
      },
    ])
  })

  it('detects when the VolumeSnapshot API is installed', async () => {
    mockAsyncKubectl(
      [
        'volumesnapshotclasses.snapshot.storage.k8s.io',
        'volumesnapshotcontents.snapshot.storage.k8s.io',
        'volumesnapshots.snapshot.storage.k8s.io',
      ].join('\n'),
    )

    await expect(isVolumeSnapshotApiAvailable()).resolves.toBe(true)
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        'api-resources',
        '--api-group',
        'snapshot.storage.k8s.io',
        '-o',
        'name',
      ]),
    )
  })

  it('detects when the VolumeSnapshot API is missing', async () => {
    mockAsyncKubectl('')

    await expect(isVolumeSnapshotApiAvailable()).resolves.toBe(false)
  })

  it('detects PVCs backed by CSI storage classes', async () => {
    mockAsyncKubectl(JSON.stringify({ spec: { storageClassName: 'csi-hostpath-sc' } }))
    mockAsyncKubectl(JSON.stringify({ provisioner: 'hostpath.csi.k8s.io' }))

    await expect(
      isPvcBackedByCsiProvisioner({
        namespace: 'shadow-csi-snapshot-smoke',
        pvcName: 'state',
      }),
    ).resolves.toBe(true)

    expect(spawnMock.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining(['-n', 'shadow-csi-snapshot-smoke', 'get', 'pvc', 'state']),
    )
    expect(spawnMock.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['get', 'storageclass', 'csi-hostpath-sc']),
    )
  })

  it('does not treat non-CSI PVC storage classes as VolumeSnapshot capable', async () => {
    mockAsyncKubectl(JSON.stringify({ spec: { storageClassName: 'standard' } }))
    mockAsyncKubectl(JSON.stringify({ provisioner: 'rancher.io/local-path' }))

    await expect(
      isPvcBackedByCsiProvisioner({
        namespace: 'gstack-buddy',
        pvcName: 'openclaw-data-strategy-buddy',
      }),
    ).resolves.toBe(false)
  })

  it('returns false when a PVC does not declare a storage class', async () => {
    mockAsyncKubectl(JSON.stringify({ spec: {} }))

    await expect(
      isPvcBackedByCsiProvisioner({
        namespace: 'shadow',
        pvcName: 'state',
      }),
    ).resolves.toBe(false)
    expect(spawnMock).toHaveBeenCalledOnce()
  })

  it('resolves a matching VolumeSnapshotClass for a CSI-backed PVC', async () => {
    mockAsyncKubectl(JSON.stringify({ spec: { storageClassName: 'csi-hostpath-sc' } }))
    mockAsyncKubectl(JSON.stringify({ provisioner: 'hostpath.csi.k8s.io' }))
    mockAsyncKubectl(
      JSON.stringify({
        items: [
          {
            driver: 'other.csi.k8s.io',
            metadata: { name: 'other-snapclass', annotations: {} },
          },
          {
            driver: 'hostpath.csi.k8s.io',
            metadata: {
              name: 'csi-hostpath-snapclass',
              annotations: {
                'snapshot.storage.kubernetes.io/is-default-class': 'true',
              },
            },
          },
        ],
      }),
    )

    await expect(
      getPvcVolumeSnapshotCapability({
        namespace: 'shadow-csi-snapshot-smoke',
        pvcName: 'source-pvc',
      }),
    ).resolves.toEqual({
      storageClassName: 'csi-hostpath-sc',
      provisioner: 'hostpath.csi.k8s.io',
      isCsi: true,
      volumeSnapshotClassName: 'csi-hostpath-snapclass',
    })
  })

  it('uses the single matching VolumeSnapshotClass even when it is not marked default', async () => {
    mockAsyncKubectl(JSON.stringify({ spec: { storageClassName: 'csi-hostpath-sc' } }))
    mockAsyncKubectl(JSON.stringify({ provisioner: 'hostpath.csi.k8s.io' }))
    mockAsyncKubectl(
      JSON.stringify({
        items: [
          {
            driver: 'hostpath.csi.k8s.io',
            metadata: { name: 'csi-hostpath-snapclass', annotations: {} },
          },
        ],
      }),
    )

    await expect(
      resolveVolumeSnapshotClassForPvc({
        namespace: 'shadow-csi-snapshot-smoke',
        pvcName: 'source-pvc',
      }),
    ).resolves.toBe('csi-hostpath-snapclass')
  })
})
