import { describe, expect, it } from 'vitest'
import { app } from './server.js'
import { shadowSpaceAppManifest } from './space-app.generated.js'

describe('Answers Space App command ingress', () => {
  it('keeps generated command ingress in the gateway contract shape', () => {
    const command = shadowSpaceAppManifest.commands.find((item) => item.name === 'questions.list')
    const record = command as Record<string, unknown> | undefined

    expect(command?.ingress?.path).toBe('/.shadow/commands/questions.list')
    expect(record?.path).toBeUndefined()
  })

  it('requires Shadow gateway authorization at the command ingress', async () => {
    const current = await app.request('/.shadow/commands/questions.list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    })
    expect(current.status).toBe(401)
    await expect(current.json()).resolves.toMatchObject({
      ok: false,
      error: 'missing_command_token',
    })
  })
})
