import { describe, expect, it } from 'vitest'
import { size } from '../../theme'
import {
  getInteractiveSheetDragOffset,
  getInteractiveSheetPanelMaxHeight,
  getInteractiveSheetTopInset,
  shouldDismissInteractiveSheetDrag,
  shouldUseKeyboardSheet,
} from './interactive-sheet-layout'

describe('interactive sheet layout', () => {
  it('keeps non-input action sheets on BottomSheetModal', () => {
    expect(shouldUseKeyboardSheet({ keyboardAware: true, hasAutoFocus: false })).toBe(false)
  })

  it('uses the keyboard sheet for auto-focused input flows', () => {
    expect(shouldUseKeyboardSheet({ keyboardAware: true, hasAutoFocus: true })).toBe(true)
  })

  it('keeps the maximum sheet below the unsafe status area', () => {
    expect(getInteractiveSheetTopInset(47, 12)).toBe(59)
  })

  it('caps input sheet height above the keyboard with a buffer', () => {
    expect(
      getInteractiveSheetPanelMaxHeight({
        windowHeight: 844,
        topInset: 59,
        bottomInset: 34,
        keyboardHeight: 336,
        keyboardBuffer: 16,
      }),
    ).toBe(433)
  })

  it('does not collapse below the minimum usable form height', () => {
    expect(
      getInteractiveSheetPanelMaxHeight({
        windowHeight: 480,
        topInset: 80,
        bottomInset: 34,
        keyboardHeight: 340,
        keyboardBuffer: 20,
        minHeight: size.dropdownMaxHeight,
      }),
    ).toBe(size.dropdownMaxHeight)
  })

  it('rubber-bands upward drags while tracking downward drags directly', () => {
    expect(getInteractiveSheetDragOffset(96)).toBe(96)
    expect(getInteractiveSheetDragOffset(-100)).toBeCloseTo(-28)
  })

  it('dismisses only after a deliberate distance or velocity', () => {
    expect(
      shouldDismissInteractiveSheetDrag({
        dragY: 80,
        velocityY: 0.4,
        panelHeight: 520,
      }),
    ).toBe(false)
    expect(
      shouldDismissInteractiveSheetDrag({
        dragY: 160,
        velocityY: 0.4,
        panelHeight: 520,
      }),
    ).toBe(true)
    expect(
      shouldDismissInteractiveSheetDrag({
        dragY: 36,
        velocityY: 1.3,
        panelHeight: 520,
      }),
    ).toBe(true)
  })
})
