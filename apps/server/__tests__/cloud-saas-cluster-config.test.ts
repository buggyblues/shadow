import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configureCloudSaasClusterFromEnv } from '../src/lib/cloud-saas-cluster-config'

describe('configureCloudSaasClusterFromEnv', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `shadow-saas-cluster-${Date.now()}-${Math.random()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('uses cluster.json plus an explicit kubeconfig path as the SaaS Kubernetes target', async () => {
    const clusterConfigPath = join(tmpDir, 'cluster.json')
    const kubeconfigPath = join(tmpDir, 'prod.yaml')
    writeFileSync(
      clusterConfigPath,
      JSON.stringify({
        name: 'prod',
        provider: 'ssh',
        nodes: [
          { role: 'master', host: '203.0.113.10', user: 'root', sshKeyPath: '~/.ssh/id_rsa' },
        ],
      }),
    )
    writeFileSync(kubeconfigPath, 'apiVersion: v1\nkind: Config\ncurrent-context: prod\n')

    const env = {
      CLOUD_SAAS_CLUSTER_CONFIG: clusterConfigPath,
      CLOUD_SAAS_CLUSTER_KUBECONFIG: kubeconfigPath,
      KUBECONFIG: '/old/kubeconfig',
    }

    await expect(configureCloudSaasClusterFromEnv(env)).resolves.toMatchObject({
      configured: true,
      clusterName: 'prod',
      clusterConfigPath,
      kubeconfigPath,
    })
    expect(env.KUBECONFIG).toBe(kubeconfigPath)
  })

  it('exports sandbox cluster capability from cluster.json', async () => {
    const clusterConfigPath = join(tmpDir, 'cluster.json')
    const kubeconfigPath = join(tmpDir, 'prod.yaml')
    writeFileSync(
      clusterConfigPath,
      JSON.stringify({
        name: 'prod',
        provider: 'ssh',
        features: {
          sandbox: {
            enabled: true,
            runtimeClassName: 'shadow-runc',
            nodeSelector: { 'shadowob.com/region': 'cn' },
          },
        },
        nodes: [
          { role: 'master', host: '203.0.113.10', user: 'root', sshKeyPath: '~/.ssh/id_rsa' },
        ],
      }),
    )
    writeFileSync(kubeconfigPath, 'apiVersion: v1\nkind: Config\ncurrent-context: prod\n')

    const env: Record<string, string | undefined> = {
      CLOUD_SAAS_CLUSTER_CONFIG: clusterConfigPath,
      CLOUD_SAAS_CLUSTER_KUBECONFIG: kubeconfigPath,
      CLOUD_SAAS_WORKLOAD_BACKEND: 'auto',
    }

    await expect(configureCloudSaasClusterFromEnv(env)).resolves.toMatchObject({
      configured: true,
      clusterName: 'prod',
    })
    expect(env.CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED).toBe('true')
    expect(env.CLOUD_SAAS_SANDBOX_RUNTIME_CLASS).toBe('shadow-runc')
    expect(env.CLOUD_SAAS_SANDBOX_NODE_SELECTOR).toBe('{"shadowob.com/region":"cn"}')
  })

  it('does nothing when CLOUD_SAAS_CLUSTER_CONFIG is not set', async () => {
    const env = { KUBECONFIG: '/existing/kubeconfig' }

    await expect(configureCloudSaasClusterFromEnv(env)).resolves.toEqual({ configured: false })
    expect(env.KUBECONFIG).toBe('/existing/kubeconfig')
  })

  it('fails fast when cluster.json is configured but no kubeconfig is available', async () => {
    const clusterConfigPath = join(tmpDir, 'cluster.json')
    writeFileSync(
      clusterConfigPath,
      JSON.stringify({
        name: 'prod',
        provider: 'ssh',
        nodes: [
          { role: 'master', host: '203.0.113.10', user: 'root', password: '${env:SSH_PASS}' },
        ],
      }),
    )

    await expect(
      configureCloudSaasClusterFromEnv({
        CLOUD_SAAS_CLUSTER_CONFIG: clusterConfigPath,
        CLOUD_SAAS_CLUSTER_KUBECONFIG: join(tmpDir, 'missing.yaml'),
      }),
    ).rejects.toThrow('kubeconfig not found')
  })

  it('fails fast when cluster kubeconfig path is a directory', async () => {
    const clusterConfigPath = join(tmpDir, 'cluster.json')
    const kubeconfigPath = join(tmpDir, 'prod.yaml')
    writeFileSync(
      clusterConfigPath,
      JSON.stringify({
        name: 'prod',
        provider: 'ssh',
        nodes: [
          { role: 'master', host: '203.0.113.10', user: 'root', password: '${env:SSH_PASS}' },
        ],
      }),
    )
    mkdirSync(kubeconfigPath, { recursive: true })

    await expect(
      configureCloudSaasClusterFromEnv({
        CLOUD_SAAS_CLUSTER_CONFIG: clusterConfigPath,
        CLOUD_SAAS_CLUSTER_KUBECONFIG: kubeconfigPath,
      }),
    ).rejects.toThrow('is a directory')
  })
})
