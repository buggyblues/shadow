import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const client = {
    createCloudDeployment: vi.fn(),
    createCloudTemplate: vi.fn(),
    destroyCloudDeployment: vi.fn(),
    getCloudDeployment: vi.fn(),
    listCloudDeployments: vi.fn(),
  }
  return {
    client,
    execFileSync: vi.fn(),
    getClient: vi.fn(async () => client),
    output: vi.fn(),
    outputError: vi.fn(),
    outputSuccess: vi.fn(),
    readFile: vi.fn(),
    spawnSync: vi.fn(),
  }
})

vi.mock('node:child_process', () => ({
  execFileSync: mocks.execFileSync,
  spawnSync: mocks.spawnSync,
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
}))

vi.mock('../src/utils/client.js', () => ({
  getClient: mocks.getClient,
}))

vi.mock('../src/utils/output.js', () => ({
  output: mocks.output,
  outputError: mocks.outputError,
  outputSuccess: mocks.outputSuccess,
}))

import { createCloudCommand } from '../src/commands/cloud.js'

async function runCloudCommand(args: string[]) {
  const command = createCloudCommand()
  command.exitOverride()
  await command.parseAsync(['node', 'cloud', ...args], { from: 'node' })
}

describe('cloud command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not proxy Space App commands to shadowob-cloud', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit ${code}`)
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      await expect(runCloudCommand(['app', 'publish', '--port', '4201'])).rejects.toThrow(
        'process.exit 1',
      )

      expect(errorSpy).toHaveBeenCalledWith(
        'Space App commands belong to shadowob space-app, not shadowob cloud.',
      )
      expect(errorSpy).toHaveBeenCalledWith('Run: shadowob space-app publish --port 4201')
      expect(mocks.execFileSync).not.toHaveBeenCalled()
      expect(mocks.spawnSync).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })

  it('creates templates through the Shadow API client', async () => {
    const payload = {
      slug: 'team-template',
      name: 'Team Template',
      content: { version: '1.0.0' },
    }
    const result = { id: 'template-1', ...payload }
    mocks.client.createCloudTemplate.mockResolvedValue(result)

    await runCloudCommand([
      'templates',
      'create',
      '--json-input',
      JSON.stringify(payload),
      '--json',
    ])

    expect(mocks.client.createCloudTemplate).toHaveBeenCalledWith(payload)
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })

  it('creates deployments from a JSON file through the Shadow API client', async () => {
    const payload = {
      namespace: 'team-runtime',
      name: 'Team Runtime',
      templateSlug: 'team-template',
      resourceTier: 'lightweight',
      configSnapshot: { version: '1.0.0' },
      runtimeContext: { locale: 'zh-CN', timezone: 'Asia/Shanghai' },
    }
    const result = { id: 'deployment-1', status: 'pending', ...payload }
    mocks.readFile.mockResolvedValue(JSON.stringify(payload))
    mocks.client.createCloudDeployment.mockResolvedValue(result)

    await runCloudCommand(['deployments', 'create', '--file', './deployment.json', '--json'])

    expect(mocks.readFile).toHaveBeenCalledWith('./deployment.json', 'utf8')
    expect(mocks.client.createCloudDeployment).toHaveBeenCalledWith(payload)
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })

  it('lists deployments through the Shadow API client', async () => {
    const result = [{ id: 'deployment-1', namespace: 'team-runtime', status: 'deployed' }]
    mocks.client.listCloudDeployments.mockResolvedValue(result)

    await runCloudCommand([
      'deployments',
      'list',
      '--include-history',
      '--limit',
      '20',
      '--offset',
      '10',
      '--json',
    ])

    expect(mocks.client.listCloudDeployments).toHaveBeenCalledWith({
      includeHistory: true,
      limit: 20,
      offset: 10,
    })
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })

  it('gets a deployment through the Shadow API client', async () => {
    const result = { id: 'deployment-1', namespace: 'team-runtime', status: 'deployed' }
    mocks.client.getCloudDeployment.mockResolvedValue(result)

    await runCloudCommand(['deployments', 'get', 'deployment-1', '--json'])

    expect(mocks.client.getCloudDeployment).toHaveBeenCalledWith('deployment-1')
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })

  it('queues deployment destruction through the Shadow API client', async () => {
    const result = { ok: true, taskId: 'deployment-1', status: 'destroying' }
    mocks.client.destroyCloudDeployment.mockResolvedValue(result)

    await runCloudCommand(['deployments', 'destroy', 'deployment-1', '--json'])

    expect(mocks.client.destroyCloudDeployment).toHaveBeenCalledWith('deployment-1')
    expect(mocks.output).toHaveBeenCalledWith(result, { json: true })
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.spawnSync).not.toHaveBeenCalled()
  })
})
