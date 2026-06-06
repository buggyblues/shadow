import { afterEach, describe, expect, it } from 'vitest'
import { resolveServerFlag } from '../src/utils/client.js'

describe('CLI client utilities', () => {
  afterEach(() => {
    delete process.env.SHADOWOB_SERVER_ID
  })

  it('resolves an explicit server id or slug', () => {
    expect(resolveServerFlag('shadow-plays')).toBe('shadow-plays')
  })

  it('resolves the server from SHADOWOB_SERVER_ID', () => {
    process.env.SHADOWOB_SERVER_ID = 'server-1'

    expect(resolveServerFlag()).toBe('server-1')
  })

  it('rejects server URLs passed where a server id or slug is expected', () => {
    expect(() => resolveServerFlag('http://localhost:3002')).toThrow(
      /expected a Shadow server ID or slug, not a server URL/,
    )
  })
})
