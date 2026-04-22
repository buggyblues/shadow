import { delimiter } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensurePulumiCliOnPath, resolvePulumiBackendUrl } from '../../src/clients/pulumi-client'

const originalPath = process.env.PATH
const originalPulumiBackendUrl = process.env.PULUMI_BACKEND_URL

describe('ensurePulumiCliOnPath', () => {
  afterEach(() => {
    process.env.PATH = originalPath
    process.env.PULUMI_BACKEND_URL = originalPulumiBackendUrl
  })

  it('prepends the Pulumi bin directory to PATH', () => {
    process.env.PATH = ['/usr/bin', '/bin'].join(delimiter)

    const binDir = ensurePulumiCliOnPath('/root/.shadowob/pulumi/cli')

    expect(process.env.PATH?.split(delimiter)[0]).toBe(binDir)
    expect(binDir).toBe('/root/.shadowob/pulumi/cli/bin')
  })

  it('does not duplicate the Pulumi bin directory', () => {
    const binDir = '/root/.shadowob/pulumi/cli/bin'
    process.env.PATH = [binDir, '/usr/bin', '/bin'].join(delimiter)

    ensurePulumiCliOnPath('/root/.shadowob/pulumi/cli')

    expect(process.env.PATH).toBe([binDir, '/usr/bin', '/bin'].join(delimiter))
  })

  it('falls back to the local file backend when PULUMI_BACKEND_URL is blank', () => {
    process.env.PULUMI_BACKEND_URL = '   '

    expect(resolvePulumiBackendUrl('/tmp/shadow-pulumi-state')).toBe(
      'file:///tmp/shadow-pulumi-state',
    )
  })

  it('keeps an explicit non-empty Pulumi backend URL', () => {
    process.env.PULUMI_BACKEND_URL = 'https://api.pulumi.example'

    expect(resolvePulumiBackendUrl('/tmp/shadow-pulumi-state')).toBe('https://api.pulumi.example')
  })
})
