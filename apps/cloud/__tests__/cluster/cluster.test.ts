/**
 * Unit tests for cluster config schema and parser.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getMasterNode,
  getWorkerNodes,
  readClusterConfig,
  resolveClusterSandboxConfig,
  resolveNodeCredentials,
  resolveNodeInstallConfig,
} from '../../src/cluster/parser.js'
import { ClusterConfigSchema } from '../../src/cluster/schema.js'

// ─── Schema validation ────────────────────────────────────────────────────────

describe('ClusterConfigSchema', () => {
  const validConfig = {
    name: 'prod',
    provider: 'ssh',
    nodes: [
      { role: 'master', host: '1.2.3.4', user: 'root', sshKeyPath: '~/.ssh/id_rsa' },
      { role: 'worker', host: '1.2.3.5', user: 'ubuntu', sshKeyPath: '~/.ssh/id_rsa' },
    ],
  }

  it('accepts a valid config', () => {
    const result = ClusterConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
  })

  it('accepts optional k3s installer settings', () => {
    const result = ClusterConfigSchema.safeParse({
      ...validConfig,
      install: {
        k3sVersion: 'v1.35.4+k3s1',
        k3sArtifactUrl: 'https://rancher-mirror.rancher.cn/k3s',
        k3sMirror: 'cn',
        systemDefaultRegistry: 'registry.cn-hangzhou.aliyuncs.com',
        pauseImage: 'registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6',
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts node-level k3s installer settings', () => {
    const result = ClusterConfigSchema.safeParse({
      ...validConfig,
      install: {
        k3sVersion: 'v1.35.4+k3s1',
        k3sMirror: 'cn',
      },
      nodes: [
        {
          role: 'master',
          host: '1.2.3.4',
          user: 'root',
          sshKeyPath: '~/.ssh/id_rsa',
          install: {
            systemDefaultRegistry: 'registry.cn-hangzhou.aliyuncs.com',
            pauseImage: 'registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6',
          },
        },
        {
          role: 'worker',
          host: '1.2.3.5',
          user: 'ubuntu',
          sshKeyPath: '~/.ssh/id_rsa',
          install: {
            k3sMirror: 'https://mirror.example.com/k3s',
          },
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nodes[0]!.install?.systemDefaultRegistry).toBe(
        'registry.cn-hangzhou.aliyuncs.com',
      )
      expect(result.data.nodes[1]!.install?.k3sMirror).toBe('https://mirror.example.com/k3s')
    }
  })

  it('accepts managed agent-sandbox feature settings', () => {
    const result = ClusterConfigSchema.safeParse({
      ...validConfig,
      features: {
        sandbox: {
          version: 'v0.4.5',
          manifestUrls: [
            'https://mirror.example.com/agent-sandbox/manifest.yaml',
            'https://mirror.example.com/agent-sandbox/extensions.yaml',
          ],
          controllerImage: 'registry.example.com/agent-sandbox-controller:v0.4.5',
          runtimeClassName: 'gvisor',
          createRuntimeClass: false,
          runtimeClassHandler: 'runsc',
          nodeSelector: { 'shadowob.com/sandbox-ready': 'true', 'shadowob.com/region': 'cn' },
          smokeTest: true,
          smokeImage: 'registry.example.com/busybox:1.36',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts registry mirrors and node labels for mixed-region clusters', () => {
    const result = ClusterConfigSchema.safeParse({
      ...validConfig,
      install: {
        registries: {
          mirrors: {
            'docker.io': {
              endpoint: ['https://docker.mirror.example.cn'],
            },
          },
          configs: {
            'registry.example.cn': {
              auth: {
                username: '${env:REGISTRY_USER}',
                password: '${env:REGISTRY_PASSWORD}',
              },
            },
          },
        },
      },
      nodes: [
        {
          role: 'master',
          host: '1.2.3.4',
          user: 'root',
          sshKeyPath: '~/.ssh/id_rsa',
          region: 'cn',
          labels: { 'shadowob.com/region': 'cn' },
          features: { sandbox: true },
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects unsafe sandbox controller image values', () => {
    const result = ClusterConfigSchema.safeParse({
      ...validConfig,
      features: {
        sandbox: {
          controllerImage: 'registry.example.com/controller:v1 --debug',
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a pause image with whitespace', () => {
    const result = ClusterConfigSchema.safeParse({
      ...validConfig,
      install: {
        pauseImage: 'registry.example.com/pause:3.6 --debug',
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a node-level pause image with whitespace', () => {
    const result = ClusterConfigSchema.safeParse({
      ...validConfig,
      nodes: [
        {
          role: 'master',
          host: '1.2.3.4',
          user: 'root',
          sshKeyPath: '~/.ssh/id_rsa',
          install: {
            pauseImage: 'registry.example.com/pause:3.6 --debug',
          },
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('defaults port to 22', () => {
    const result = ClusterConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nodes[0]!.port).toBe(22)
    }
  })

  it('rejects config with no nodes', () => {
    const result = ClusterConfigSchema.safeParse({ ...validConfig, nodes: [] })
    expect(result.success).toBe(false)
  })

  it('rejects config with two masters', () => {
    const twoMasters = {
      ...validConfig,
      nodes: [
        { role: 'master', host: '1.2.3.4', user: 'root', sshKeyPath: '~/.ssh/id_rsa' },
        { role: 'master', host: '1.2.3.5', user: 'root', sshKeyPath: '~/.ssh/id_rsa' },
      ],
    }
    const result = ClusterConfigSchema.safeParse(twoMasters)
    expect(result.success).toBe(false)
  })

  it('rejects config with no master', () => {
    const noMaster = {
      ...validConfig,
      nodes: [{ role: 'worker', host: '1.2.3.4', user: 'root', sshKeyPath: '~/.ssh/id_rsa' }],
    }
    const result = ClusterConfigSchema.safeParse(noMaster)
    expect(result.success).toBe(false)
  })

  it('rejects a node with no SSH auth method', () => {
    const noAuth = {
      ...validConfig,
      nodes: [{ role: 'master', host: '1.2.3.4', user: 'root' }],
    }
    const result = ClusterConfigSchema.safeParse(noAuth)
    expect(result.success).toBe(false)
  })

  it('accepts a node with password only', () => {
    const withPassword = {
      ...validConfig,
      nodes: [
        { role: 'master', host: '1.2.3.4', user: 'root', password: 'secret' },
        { role: 'worker', host: '1.2.3.5', user: 'ubuntu', sshKeyPath: '~/.ssh/id_rsa' },
      ],
    }
    const result = ClusterConfigSchema.safeParse(withPassword)
    expect(result.success).toBe(true)
  })

  it('accepts a node with sshAgent only', () => {
    const withAgent = {
      ...validConfig,
      nodes: [{ role: 'master', host: '1.2.3.4', user: 'root', sshAgent: true }],
    }
    const result = ClusterConfigSchema.safeParse(withAgent)
    expect(result.success).toBe(true)
  })

  it('rejects invalid cluster name (uppercase)', () => {
    const result = ClusterConfigSchema.safeParse({ ...validConfig, name: 'MyCluster' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown provider', () => {
    const result = ClusterConfigSchema.safeParse({ ...validConfig, provider: 'terraform' })
    expect(result.success).toBe(false)
  })
})

// ─── readClusterConfig ────────────────────────────────────────────────────────

describe('readClusterConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `shadow-cloud-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads and validates a valid cluster.json', () => {
    const configPath = join(tmpDir, 'cluster.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        name: 'test',
        provider: 'ssh',
        nodes: [{ role: 'master', host: '1.2.3.4', user: 'root', sshKeyPath: '~/.ssh/id_rsa' }],
      }),
    )

    const config = readClusterConfig(configPath)
    expect(config.name).toBe('test')
    expect(config.nodes).toHaveLength(1)
  })

  it('throws on missing file', () => {
    expect(() => readClusterConfig('/nonexistent/cluster.json')).toThrow('Failed to read')
  })

  it('throws on invalid JSON', () => {
    const configPath = join(tmpDir, 'bad.json')
    writeFileSync(configPath, '{ invalid json }')
    expect(() => readClusterConfig(configPath)).toThrow('Failed to read')
  })

  it('throws on schema violation with descriptive message', () => {
    const configPath = join(tmpDir, 'cluster.json')
    writeFileSync(configPath, JSON.stringify({ name: 'test', provider: 'ssh', nodes: [] }))
    expect(() => readClusterConfig(configPath)).toThrow('Invalid cluster.json')
  })
})

// ─── resolveNodeCredentials ───────────────────────────────────────────────────

describe('resolveNodeCredentials', () => {
  it('expands ~ in sshKeyPath', () => {
    const creds = resolveNodeCredentials({
      role: 'master',
      host: '1.2.3.4',
      port: 22,
      user: 'root',
      sshKeyPath: '~/.ssh/id_rsa',
    })
    expect(creds.sshKeyPath).toMatch(/^\//)
    expect(creds.sshKeyPath).toContain('.ssh/id_rsa')
  })

  it('resolves ${env:VAR} in password', () => {
    process.env.TEST_SSH_PASS = 'supersecret'
    const creds = resolveNodeCredentials({
      role: 'worker',
      host: '1.2.3.5',
      port: 22,
      user: 'ubuntu',
      password: '${env:TEST_SSH_PASS}',
    })
    delete process.env.TEST_SSH_PASS
    expect(creds.password).toBe('supersecret')
  })

  it('resolves ${env:VAR} in ssh key passphrase', () => {
    process.env.TEST_SSH_KEY_PASSPHRASE = 'key-secret'
    const creds = resolveNodeCredentials({
      role: 'master',
      host: '1.2.3.4',
      port: 22,
      user: 'root',
      sshKeyPath: '~/.ssh/id_rsa',
      sshKeyPassphrase: '${env:TEST_SSH_KEY_PASSPHRASE}',
    })
    delete process.env.TEST_SSH_KEY_PASSPHRASE
    expect(creds.sshKeyPassphrase).toBe('key-secret')
  })

  it('resolves sshAgent=true from SSH_AUTH_SOCK', () => {
    const previous = process.env.SSH_AUTH_SOCK
    process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock'
    const creds = resolveNodeCredentials({
      role: 'master',
      host: '1.2.3.4',
      port: 22,
      user: 'root',
      sshAgent: true,
    })
    if (previous === undefined) {
      delete process.env.SSH_AUTH_SOCK
    } else {
      process.env.SSH_AUTH_SOCK = previous
    }
    expect(creds.sshAgent).toBe('/tmp/ssh-agent.sock')
  })

  it('throws if sshAgent=true and SSH_AUTH_SOCK is not set', () => {
    const previous = process.env.SSH_AUTH_SOCK
    delete process.env.SSH_AUTH_SOCK
    expect(() =>
      resolveNodeCredentials({
        role: 'master',
        host: '1.2.3.4',
        port: 22,
        user: 'root',
        sshAgent: true,
      }),
    ).toThrow('SSH_AUTH_SOCK')
    if (previous !== undefined) {
      process.env.SSH_AUTH_SOCK = previous
    }
  })

  it('throws if env var is not set', () => {
    delete process.env.MISSING_VAR
    expect(() =>
      resolveNodeCredentials({
        role: 'worker',
        host: '1.2.3.5',
        port: 22,
        user: 'ubuntu',
        password: '${env:MISSING_VAR}',
      }),
    ).toThrow('MISSING_VAR')
  })

  it('returns plain password as-is', () => {
    const creds = resolveNodeCredentials({
      role: 'worker',
      host: '1.2.3.5',
      port: 22,
      user: 'ubuntu',
      password: 'plainpassword',
    })
    expect(creds.password).toBe('plainpassword')
  })
})

// ─── resolveNodeInstallConfig ────────────────────────────────────────────────

describe('resolveNodeInstallConfig', () => {
  it('merges cluster defaults with node-level overrides', () => {
    const config = ClusterConfigSchema.parse({
      name: 'mixed',
      provider: 'ssh',
      install: {
        k3sMirror: 'cn',
        systemDefaultRegistry: 'registry.cn-hangzhou.aliyuncs.com',
        pauseImage: 'registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6',
      },
      nodes: [
        {
          role: 'master',
          host: '1.2.3.4',
          user: 'root',
          sshKeyPath: '~/.ssh/id_rsa',
          install: {
            systemDefaultRegistry: 'registry.example.com',
          },
        },
      ],
    })

    const install = resolveNodeInstallConfig(config.install, config.nodes[0]!)
    expect(install).toEqual({
      k3sMirror: 'cn',
      systemDefaultRegistry: 'registry.example.com',
      pauseImage: 'registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6',
    })
  })
})

// ─── resolveClusterSandboxConfig ─────────────────────────────────────────────

describe('resolveClusterSandboxConfig', () => {
  it('normalizes features.sandbox=true to a managed install', () => {
    const config = ClusterConfigSchema.parse({
      name: 'sandboxed',
      provider: 'ssh',
      features: { sandbox: true },
      nodes: [{ role: 'master', host: '1.2.3.4', user: 'root', sshKeyPath: '~/.ssh/id_rsa' }],
    })

    const sandbox = resolveClusterSandboxConfig(config)

    expect(sandbox).toMatchObject({
      enabled: true,
      install: true,
      version: 'v0.4.5',
      runtimeClassName: 'shadow-runc',
      createRuntimeClass: true,
      runtimeClassHandler: 'runc',
      nodeSelector: { 'shadowob.com/sandbox-ready': 'true' },
    })
    expect(sandbox?.manifestUrls).toEqual([
      'https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.4.5/manifest.yaml',
      'https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v0.4.5/extensions.yaml',
    ])
  })

  it('returns null when sandbox is omitted or disabled', () => {
    const config = ClusterConfigSchema.parse({
      name: 'plain',
      provider: 'ssh',
      features: { sandbox: false },
      nodes: [{ role: 'master', host: '1.2.3.4', user: 'root', sshKeyPath: '~/.ssh/id_rsa' }],
    })

    expect(resolveClusterSandboxConfig(config)).toBeNull()
  })
})

// ─── getMasterNode / getWorkerNodes ───────────────────────────────────────────

describe('getMasterNode / getWorkerNodes', () => {
  const config = ClusterConfigSchema.parse({
    name: 'test',
    provider: 'ssh',
    nodes: [
      { role: 'master', host: '10.0.0.1', user: 'root', sshKeyPath: '~/.ssh/id_rsa' },
      { role: 'worker', host: '10.0.0.2', user: 'ubuntu', sshKeyPath: '~/.ssh/id_rsa' },
      { role: 'worker', host: '10.0.0.3', user: 'ubuntu', sshKeyPath: '~/.ssh/id_rsa' },
    ],
  })

  it('getMasterNode returns the master', () => {
    const master = getMasterNode(config)
    expect(master.host).toBe('10.0.0.1')
    expect(master.role).toBe('master')
  })

  it('getWorkerNodes returns only workers', () => {
    const workers = getWorkerNodes(config)
    expect(workers).toHaveLength(2)
    expect(workers.every((w) => w.role === 'worker')).toBe(true)
  })
})
