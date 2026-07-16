import { describe, expect, it } from 'vitest'
import {
  computerStatusClasses,
  isComputerStatusAvailable,
  isComputerStatusProgressing,
} from './computer-status'

describe('computer status presentation', () => {
  it.each(['online', 'deployed', 'running', 'ready'])('%s uses the available state', (status) => {
    expect(isComputerStatusAvailable(status)).toBe(true)
    expect(computerStatusClasses(status).dot).toContain('emerald')
  })

  it.each([
    'pending',
    'deploying',
    'resuming',
    'destroying',
    'cancelling',
  ])('%s uses the progressing state', (status) => {
    expect(isComputerStatusProgressing(status)).toBe(true)
    expect(computerStatusClasses(status).dot).toContain('amber')
  })

  it('keeps paused and failed states visually distinct', () => {
    expect(computerStatusClasses('paused').dot).toContain('sky')
    expect(computerStatusClasses('failed').dot).toContain('rose')
    expect(computerStatusClasses('error').dot).toContain('rose')
  })
})
