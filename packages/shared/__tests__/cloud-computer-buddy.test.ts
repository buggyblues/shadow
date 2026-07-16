import { describe, expect, it, vi } from 'vitest'
import {
  findReadyCloudComputerBuddy,
  waitForCloudComputerBuddy,
} from '../src/utils/cloud-computer-buddy'

describe('cloud computer Buddy handshake', () => {
  it('selects the requested Buddy by its stable public id', () => {
    expect(
      findReadyCloudComputerBuddy(
        [
          { id: 'host', name: 'Cloud Computer', status: 'running', botUser: { id: 'host-user' } },
          { id: 'buddy', name: 'My Buddy', status: 'running', botUser: { id: 'buddy-user' } },
        ],
        'buddy',
      )?.id,
    ).toBe('buddy')
  })

  it('waits until the Buddy has connected before returning it', async () => {
    vi.useFakeTimers()
    try {
      const load = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'buddy', name: 'My Buddy', status: 'pending' }])
        .mockResolvedValueOnce([
          {
            id: 'buddy',
            name: 'My Buddy',
            status: 'running',
            botUser: { id: 'buddy-user' },
          },
        ])
      const pending = waitForCloudComputerBuddy({
        load,
        expectedId: 'buddy',
        timeoutMs: 5_000,
        pollIntervalMs: 100,
      })

      await vi.advanceTimersByTimeAsync(100)

      await expect(pending).resolves.toMatchObject({ id: 'buddy', status: 'running' })
      expect(load).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries while the new cloud computer endpoint is becoming available', async () => {
    vi.useFakeTimers()
    try {
      const load = vi
        .fn()
        .mockRejectedValueOnce(new Error('Cloud computer is preparing'))
        .mockResolvedValueOnce([
          {
            id: 'buddy',
            name: 'My Buddy',
            status: 'running',
            botUser: { id: 'buddy-user' },
          },
        ])
      const pending = waitForCloudComputerBuddy({
        load,
        expectedId: 'buddy',
        timeoutMs: 5_000,
        pollIntervalMs: 100,
      })

      await vi.advanceTimersByTimeAsync(100)

      await expect(pending).resolves.toMatchObject({ id: 'buddy' })
      expect(load).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
