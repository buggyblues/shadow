import { describe, expect, it } from 'vitest'
import {
  desktopWindowChromeStateSchema,
  desktopWindowFullscreenInputSchema,
} from '../src/desktop-ipc/schema'

describe('desktop window chrome schemas', () => {
  it('accepts fullscreen commands and window state snapshots', () => {
    expect(desktopWindowFullscreenInputSchema.parse(true)).toBe(true)
    expect(desktopWindowChromeStateSchema.parse({ fullscreen: true, maximized: false })).toEqual({
      fullscreen: true,
      maximized: false,
    })
  })

  it('rejects incomplete window state snapshots', () => {
    expect(() => desktopWindowChromeStateSchema.parse({ fullscreen: true })).toThrow()
  })
})
