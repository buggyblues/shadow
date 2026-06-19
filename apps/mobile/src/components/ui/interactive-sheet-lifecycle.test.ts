import { describe, expect, it } from 'vitest'
import {
  createInteractiveSheetLifecycleState,
  resolveInteractiveSheetDismiss,
  syncInteractiveSheetVisibility,
} from './interactive-sheet-lifecycle'

describe('interactive sheet lifecycle', () => {
  it('does not dismiss on the initial hidden render', () => {
    const state = createInteractiveSheetLifecycleState()

    expect(syncInteractiveSheetVisibility(state, false)).toBeNull()
    expect(state.isPresented).toBe(false)
    expect(state.programmaticDismissPending).toBe(false)
  })

  it('ignores a stale programmatic dismiss when the sheet is reopened before onDismiss arrives', () => {
    const state = createInteractiveSheetLifecycleState()

    expect(syncInteractiveSheetVisibility(state, true)).toBe('present')
    expect(syncInteractiveSheetVisibility(state, false)).toBe('dismiss')
    expect(syncInteractiveSheetVisibility(state, true)).toBe('present')

    const dismiss = resolveInteractiveSheetDismiss(state, true)
    expect(dismiss.shouldClose).toBe(false)
    expect(dismiss.shouldReopen).toBe(true)
  })

  it('turns a user-driven backdrop or pan dismissal into one close callback', () => {
    const state = createInteractiveSheetLifecycleState()

    expect(syncInteractiveSheetVisibility(state, true)).toBe('present')

    const dismiss = resolveInteractiveSheetDismiss(state, true)
    expect(dismiss.shouldClose).toBe(true)
    expect(dismiss.shouldReopen).toBe(false)
    expect(syncInteractiveSheetVisibility(state, false)).toBeNull()
  })

  it('does not request an extra close when a prop-driven dismiss completes normally', () => {
    const state = createInteractiveSheetLifecycleState()

    expect(syncInteractiveSheetVisibility(state, true)).toBe('present')
    expect(syncInteractiveSheetVisibility(state, false)).toBe('dismiss')

    const dismiss = resolveInteractiveSheetDismiss(state, false)
    expect(dismiss.shouldClose).toBe(false)
    expect(dismiss.shouldReopen).toBe(false)
  })
})
