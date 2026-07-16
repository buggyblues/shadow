import { describe, expect, it } from 'vitest'
import { shouldUseWindowBackdrop } from './window-performance'

describe('shouldUseWindowBackdrop', () => {
  it('keeps blur for compact floating windows', () => {
    expect(
      shouldUseWindowBackdrop({
        focused: false,
        width: 800,
        height: 560,
        maximized: false,
      }),
    ).toBe(true)
  })

  it('keeps full blur on the focused window at any size', () => {
    expect(
      shouldUseWindowBackdrop({
        focused: true,
        width: 1080,
        height: 624,
        maximized: false,
      }),
    ).toBe(true)
    expect(
      shouldUseWindowBackdrop({
        focused: true,
        width: 800,
        height: 560,
        maximized: true,
      }),
    ).toBe(true)
  })

  it('disables stacked blur only for large background windows', () => {
    expect(
      shouldUseWindowBackdrop({
        focused: false,
        width: 1080,
        height: 624,
        maximized: false,
      }),
    ).toBe(false)
    expect(
      shouldUseWindowBackdrop({
        focused: false,
        width: 800,
        height: 560,
        maximized: true,
      }),
    ).toBe(false)
  })
})
