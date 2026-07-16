import { describe, expect, it, vi } from 'vitest'
import { AccessService } from '../src/security/access.service'

describe('AccessService.assertCanInstallAgentToServer', () => {
  it('requires Space membership rather than an admin role', async () => {
    const policyService = {
      requireServerRole: vi.fn().mockResolvedValue({ role: 'member' }),
    }
    const service = new AccessService({
      policyService,
    } as unknown as ConstructorParameters<typeof AccessService>[0])

    await expect(service.assertCanInstallAgentToServer('user-1', 'server-1')).resolves.toBe(true)
    expect(policyService.requireServerRole).toHaveBeenCalledWith('user-1', 'server-1', 'member')
  })
})
