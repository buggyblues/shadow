import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DeploymentRuntimeService,
  rewriteLoopbackKubeconfig,
} from '../../src/services/deployment-runtime.service'

const originalLoopbackHost = process.env.KUBECONFIG_LOOPBACK_HOST
const originalKubeconfig = process.env.KUBECONFIG
const originalKubeconfigHostPath = process.env.KUBECONFIG_HOST_PATH
const originalHome = process.env.HOME
const originalContainerized = process.env.SHADOW_CONTAINERIZED
const originalRuntimeTestToken = process.env.SHADOW_RUNTIME_TEST_TOKEN
const tempDirs: string[] = []

afterEach(() => {
  if (originalLoopbackHost === undefined) {
    delete process.env.KUBECONFIG_LOOPBACK_HOST
  } else {
    process.env.KUBECONFIG_LOOPBACK_HOST = originalLoopbackHost
  }

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

  if (originalRuntimeTestToken === undefined) {
    delete process.env.SHADOW_RUNTIME_TEST_TOKEN
  } else {
    process.env.SHADOW_RUNTIME_TEST_TOKEN = originalRuntimeTestToken
  }

  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  vi.restoreAllMocks()
})

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

describe('DeploymentRuntimeService.destroy', () => {
  it('passes a stored config snapshot to DeployService.destroy when available', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    const runtime = new DeploymentRuntimeService({ destroy } as unknown as never)
    const configSnapshot = {
      version: '1',
      deployments: {
        agents: [{ id: 'agent-1', runtime: 'openclaw' }],
      },
    }

    await runtime.destroy({
      namespace: 'qa-destroy-test',
      stack: 'deployment-1',
      configSnapshot,
    })

    expect(destroy).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'qa-destroy-test',
        stack: 'deployment-1',
        config: configSnapshot,
      }),
    )
  })

  it('passes a rewritten kubeconfig path through to DeployService.destroy', async () => {
    process.env.KUBECONFIG_LOOPBACK_HOST = 'host.lima.internal'
    const ambientKubeconfig = process.env.KUBECONFIG

    const destroy = vi.fn().mockImplementation(async (options) => {
      expect(options.k8sContext).toBe('local')
      expect(options.kubeConfigPath).toContain('.shadowob/kubeconfigs/')
      expect(process.env.KUBECONFIG).toBe(ambientKubeconfig)
      expect(readFileSync(options.kubeConfigPath, 'utf8')).toContain(
        'server: https://host.lima.internal:6443',
      )
    })

    const runtime = new DeploymentRuntimeService({ destroy } as unknown as never)

    await runtime.destroy({
      namespace: 'qa-destroy-test',
      stack: 'deployment-1',
      configSnapshot: {
        version: '1',
        deployments: {
          agents: [{ id: 'agent-1', runtime: 'openclaw' }],
        },
      },
      cluster: {
        name: 'local',
        kubeconfig: `apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: local
contexts:
- context:
    cluster: local
    user: local
  name: local
current-context: local
users:
- name: local
  user:
    token: test`,
      },
    })

    expect(destroy).toHaveBeenCalledOnce()
  })
})

describe('DeploymentRuntimeService.deployFromSnapshot', () => {
  it('passes a rewritten kubeconfig path through to DeployService.up', async () => {
    process.env.KUBECONFIG_LOOPBACK_HOST = 'host.lima.internal'
    const ambientKubeconfig = process.env.KUBECONFIG

    const up = vi.fn().mockImplementation(async (options) => {
      expect(options.k8sContext).toBe('local')
      expect(options.kubeConfigPath).toContain('.shadowob/kubeconfigs/')
      expect(process.env.KUBECONFIG).toBe(ambientKubeconfig)
      expect(readFileSync(options.kubeConfigPath, 'utf8')).toContain(
        'server: https://host.lima.internal:6443',
      )

      return {
        namespace: options.namespace,
        agentCount: 1,
        config: {
          version: '1',
          deployments: {
            agents: [{ id: 'agent-1', runtime: 'openclaw' }],
          },
        },
      }
    })

    const runtime = new DeploymentRuntimeService({ up } as unknown as never)

    await runtime.deployFromSnapshot({
      namespace: 'qa-deploy-test',
      stack: 'deployment-1',
      configSnapshot: {
        version: '1',
        deployments: {
          agents: [{ id: 'agent-1', runtime: 'openclaw' }],
        },
      },
      cluster: {
        name: 'local',
        kubeconfig: `apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: local
contexts:
- context:
    cluster: local
    user: local
  name: local
current-context: local
users:
- name: local
  user:
    token: test`,
      },
    })

    expect(up).toHaveBeenCalledOnce()
  })

  it('keeps host kubeconfig loopback endpoints unchanged when using KUBECONFIG_HOST_PATH', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'shadow-kubeconfig-'))
    tempDirs.push(tempDir)

    const hostKubeconfigPath = join(tempDir, 'config.yaml')
    writeFileSync(
      hostKubeconfigPath,
      `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: host-cluster
contexts:
- context:
    cluster: host-cluster
    user: host-user
  name: host-cluster
current-context: host-cluster
users:
- name: host-user
  user:
    token: host-token`,
      'utf8',
    )

    process.env.KUBECONFIG = '/root/.kube/config'
    process.env.KUBECONFIG_HOST_PATH = hostKubeconfigPath
    process.env.KUBECONFIG_LOOPBACK_HOST = 'host.lima.internal'
    const ambientKubeconfig = process.env.KUBECONFIG

    const up = vi.fn().mockImplementation(async (options) => {
      expect(options.k8sContext).toBe('host-cluster')
      expect(options.kubeConfigPath).toBe(hostKubeconfigPath)
      expect(process.env.KUBECONFIG).toBe(ambientKubeconfig)
      expect(readFileSync(options.kubeConfigPath, 'utf8')).toContain(
        'server: https://127.0.0.1:6443',
      )
      expect(readFileSync(options.kubeConfigPath, 'utf8')).not.toContain('host.lima.internal')

      return {
        namespace: 'qa-deploy-test',
        agentCount: 1,
        config: {
          version: '1',
          deployments: {
            agents: [{ id: 'agent-1', runtime: 'openclaw' }],
          },
        },
      }
    })

    const runtime = new DeploymentRuntimeService({ up } as unknown as never)

    await runtime.deployFromSnapshot({
      namespace: 'qa-deploy-test',
      stack: 'deployment-ambient-host-path',
      configSnapshot: {
        version: '1',
        deployments: {
          agents: [{ id: 'agent-1', runtime: 'openclaw' }],
        },
      },
    })

    expect(up).toHaveBeenCalledOnce()
  })

  it('rewrites mounted home kubeconfig paths when running in a containerized runtime', async () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'shadow-container-home-'))
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
    process.env.KUBECONFIG_LOOPBACK_HOST = 'host.lima.internal'
    process.env.SHADOW_CONTAINERIZED = '1'

    const up = vi.fn().mockImplementation(async (options) => {
      expect(options.k8sContext).toBe('mounted-cluster')
      expect(process.env.KUBECONFIG).toBe(mountedKubeconfigPath)
      expect(typeof options.kubeConfigPath).toBe('string')
      expect(options.kubeConfigPath).toContain('.shadowob/kubeconfigs/')
      expect(options.kubeConfigPath).not.toBe(mountedKubeconfigPath)
      expect(readFileSync(options.kubeConfigPath!, 'utf8')).toContain(
        'server: https://host.lima.internal:6443',
      )

      return {
        namespace: 'qa-containerized-runtime',
        agentCount: 1,
        config: {
          version: '1',
          deployments: {
            agents: [{ id: 'agent-1', runtime: 'openclaw' }],
          },
        },
      }
    })

    const runtime = new DeploymentRuntimeService({ up } as unknown as never)

    await runtime.deployFromSnapshot({
      namespace: 'qa-containerized-runtime',
      stack: 'deployment-containerized-runtime',
      configSnapshot: {
        version: '1',
        deployments: {
          agents: [{ id: 'agent-1', runtime: 'openclaw' }],
        },
      },
    })

    expect(up).toHaveBeenCalledOnce()
  })

  it('passes runtime env overrides without mutating process.env', async () => {
    delete process.env.SHADOW_RUNTIME_TEST_TOKEN

    const up = vi.fn().mockImplementation(async (options) => {
      expect(options.runtimeEnvVars).toEqual({ SHADOW_RUNTIME_TEST_TOKEN: 'tenant-a-token' })
      expect(process.env.SHADOW_RUNTIME_TEST_TOKEN).toBeUndefined()

      return {
        namespace: 'qa-runtime-env',
        agentCount: 1,
        config: {
          version: '1',
          deployments: {
            agents: [{ id: 'agent-1', runtime: 'openclaw' }],
          },
        },
      }
    })

    const runtime = new DeploymentRuntimeService({ up } as unknown as never)

    await runtime.deployFromSnapshot({
      namespace: 'qa-runtime-env',
      stack: 'deployment-runtime-env',
      configSnapshot: {
        version: '1',
        deployments: {
          agents: [{ id: 'agent-1', runtime: 'openclaw' }],
        },
      },
      runtimeEnvVars: {
        SHADOW_RUNTIME_TEST_TOKEN: 'tenant-a-token',
        EMPTY_RUNTIME_VALUE: '',
        SAVED_RUNTIME_VALUE: '__SAVED__',
      },
    })

    expect(up).toHaveBeenCalledOnce()
    expect(process.env.SHADOW_RUNTIME_TEST_TOKEN).toBeUndefined()
  })
})
