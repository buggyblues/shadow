import { describe, expect, it } from 'vitest'
import {
  CLOUD_COMPUTER_SHELL_COLORS,
  defaultCloudComputerShellColor,
  resolveCloudComputerShellColor,
} from '../src/utils/cloud-computer-appearance'

describe('cloud computer appearance', () => {
  it('keeps an explicitly supported shell color', () => {
    expect(resolveCloudComputerShellColor('grape', 'computer-1')).toBe('grape')
  })

  it('derives a stable fallback color from the cloud computer id', () => {
    const color = defaultCloudComputerShellColor('computer-1')
    expect(CLOUD_COMPUTER_SHELL_COLORS).toContain(color)
    expect(defaultCloudComputerShellColor('computer-1')).toBe(color)
    expect(resolveCloudComputerShellColor('not-a-color', 'computer-1')).toBe(color)
  })
})
