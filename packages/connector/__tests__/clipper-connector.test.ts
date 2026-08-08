import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createClipperConnector } from '../src/clipper-connector.js'

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(
    cleanup
      .splice(0)
      .reverse()
      .map((operation) => operation()),
  )
})

async function startBridge() {
  const root = await mkdtemp(join(tmpdir(), 'shadow-connector-clipper-'))
  const bridge = await createClipperConnector({ root, token: 'connector-test-token' })
  await new Promise<void>((resolve, reject) => {
    bridge.server.once('error', reject)
    bridge.server.listen(0, '127.0.0.1', resolve)
  })
  const address = bridge.server.address() as AddressInfo
  cleanup.push(async () => {
    await bridge.shutdown()
    await rm(root, { force: true, recursive: true })
  })
  return { bridge, url: `http://127.0.0.1:${address.port}` }
}

function headers(clientId?: string): Record<string, string> {
  return {
    Authorization: 'Bearer connector-test-token',
    'Content-Type': 'application/json',
    ...(clientId ? { 'X-Clipper-Client': clientId } : {}),
  }
}

describe('Clipper Connector', () => {
  it('exchanges a one-time pairing code for a scoped revocable client credential', async () => {
    const { url } = await startBridge()
    const created = await fetch(`${url}/v1/admin/pairings`, {
      body: JSON.stringify({ clientId: 'paired-extension' }),
      headers: headers(),
      method: 'POST',
    })
    expect(created.status).toBe(201)
    const { pairing } = (await created.json()) as {
      pairing: { clientId: string; code: string; expiresAt: string }
    }
    expect(pairing).toMatchObject({ clientId: 'paired-extension' })
    expect(Date.parse(pairing.expiresAt)).toBeGreaterThan(Date.now())

    const claimed = await fetch(`${url}/v1/pairings/claim`, {
      body: JSON.stringify({ clientId: 'paired-extension', code: pairing.code }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    expect(claimed.status).toBe(200)
    const { token } = (await claimed.json()) as { token: string }
    expect(token).toMatch(/^client_/)

    const replay = await fetch(`${url}/v1/pairings/claim`, {
      body: JSON.stringify({ clientId: 'paired-extension', code: pairing.code }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    expect(replay.status).toBe(401)

    const clientHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Clipper-Client': 'paired-extension',
    }
    const heartbeat = await fetch(`${url}/v1/clients/paired-extension/heartbeat`, {
      body: JSON.stringify({
        capabilities: {
          buildRevision: 'a'.repeat(40),
          extensionVersion: '1.2.3',
          plugins: [],
          protocolVersion: 3,
          resources: {},
        },
        claim: false,
      }),
      headers: clientHeaders,
      method: 'POST',
    })
    expect(heartbeat.status).toBe(200)

    const adminDenied = await fetch(`${url}/v1/admin/token/rotate`, {
      headers: clientHeaders,
      method: 'POST',
    })
    expect(adminDenied.status).toBe(403)

    const clients = await fetch(`${url}/v1/plugins`, { headers: headers() }).then((response) =>
      response.json(),
    )
    expect(clients).toMatchObject({
      clients: [
        {
          buildRevision: 'a'.repeat(40),
          clientId: 'paired-extension',
          extensionVersion: '1.2.3',
          protocolVersion: 3,
        },
      ],
    })

    const revoked = await fetch(`${url}/v1/admin/clients/paired-extension/credential`, {
      headers: headers(),
      method: 'DELETE',
    })
    expect(revoked.status).toBe(200)
    const deniedAfterRevoke = await fetch(`${url}/v1/clients/paired-extension/heartbeat`, {
      body: JSON.stringify({ capabilities: {}, claim: false }),
      headers: clientHeaders,
      method: 'POST',
    })
    expect(deniedAfterRevoke.status).toBe(401)
  })

  it('hands a community session to a connected extension exactly once', async () => {
    const { bridge, url } = await startBridge()
    const capabilities = {
      extensionVersion: '1.0.0',
      plugins: [],
      protocolVersion: 3,
      resources: { 'community-session': ['claim'] },
    }
    await fetch(`${url}/v1/clients/desktop-test/heartbeat`, {
      body: JSON.stringify({ capabilities, claim: false }),
      headers: headers(),
      method: 'POST',
    })

    const authorization = await bridge.authorizeCommunitySession({
      accessToken: 'access-token',
      endpoint: 'https://shadowob.com',
      refreshToken: 'refresh-token',
    })
    expect(authorization.taskId).toMatch(/^agent_/)

    const claimed = await fetch(`${url}/v1/community/session/claim`, {
      headers: headers('desktop-test'),
      method: 'POST',
    })
    expect(claimed.status).toBe(200)
    expect(await claimed.json()).toMatchObject({
      session: {
        accessToken: 'access-token',
        endpoint: 'https://shadowob.com',
        refreshToken: 'refresh-token',
      },
    })

    const replay = await fetch(`${url}/v1/community/session/claim`, {
      headers: headers('desktop-test'),
      method: 'POST',
    })
    expect(replay.status).toBe(410)

    await bridge.authorizeCommunitySession({
      accessToken: '',
      clear: true,
      endpoint: 'https://shadowob.com',
      refreshToken: '',
    })
    const signedOut = await fetch(`${url}/v1/community/session/claim`, {
      headers: headers('desktop-test'),
      method: 'POST',
    })
    expect(await signedOut.json()).toMatchObject({
      session: { accessToken: '', clear: true, refreshToken: '' },
    })
  })

  it('rejects login authorization until an extension declares support', async () => {
    const { bridge } = await startBridge()
    await expect(
      bridge.authorizeCommunitySession({
        accessToken: 'access-token',
        endpoint: 'https://shadowob.com',
        refreshToken: '',
      }),
    ).rejects.toThrow('No connected Shadow Clipper client')
  })
})
