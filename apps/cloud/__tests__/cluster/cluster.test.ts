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
  resolveNodeCredentials,
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

  it('rejects a pause image with whitespace', () => {
    const result = ClusterConfigSchema.safeParse({
      ...validConfig,
      install: {
        pauseImage: 'registry.example.com/pause:3.6 --debug',
      },
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

  it('rejects a node with neither sshKeyPath nor password', () => {
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
