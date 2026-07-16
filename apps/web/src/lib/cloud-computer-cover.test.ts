import { describe, expect, it } from 'vitest'
import { canLoadCloudComputerApps } from './cloud-computer-cover'

describe('canLoadCloudComputerApps', () => {
  it.each([
    'pending',
    'deploying',
    'cancelling',
    'resuming',
    'destroying',
    'failed',
    'destroyed',
  ])('does not load optional Apps while the Cloud Computer is %s', (status) => {
    expect(canLoadCloudComputerApps(status)).toBe(false)
  })

  it.each(['deployed', 'paused'])('loads Apps when the Cloud Computer is %s', (status) => {
    expect(canLoadCloudComputerApps(status)).toBe(true)
  })
})
